/**
 * User Segments Service
 * 
 * Сервис для работы с сегментами пользователей.
 * Поддерживает динамические фильтры и статические списки.
 */

import { prisma } from './database.js';
import { SegmentType } from '@prisma/client';
import { dbLogger } from '../utils/logger.js';

// ============================================
// TYPES
// ============================================

export interface FilterRules {
  // Subscription
  subscription_tier?: string[];        // ["premium", "basic"]
  status?: string;                     // "active"
  
  // Time-based
  date_created?: { gte?: string; lt?: string };  // {"gte": "-7 days"}
  last_entry_at?: { gte?: string; lt?: string }; // {"lt": "-30 days"}
  
  // Activity
  entries_count?: { gte?: number; lt?: number }; // {"gte": 10}
  has_voice_entries?: boolean;                   // true
}

export interface SegmentUserResult {
  telegramIds: bigint[];
  count: number;
}

// ============================================
// PARSE RELATIVE TIME
// ============================================

/**
 * Parse relative time string to Date
 * @example "-7 days" → Date 7 days ago
 * @example "-1 day" → Date 1 day ago
 */
function parseRelativeTime(value: string): Date {
  const match = value.match(/^(-?\d+)\s*(day|days|week|weeks|month|months|hour|hours)$/);
  if (!match) {
    throw new Error(`Invalid relative time format: ${value}`);
  }
  
  const amount = parseInt(match[1], 10);
  const unit = match[2];
  
  const now = new Date();
  
  switch (unit) {
    case 'hour':
    case 'hours':
      now.setHours(now.getHours() + amount);
      break;
    case 'day':
    case 'days':
      now.setDate(now.getDate() + amount);
      break;
    case 'week':
    case 'weeks':
      now.setDate(now.getDate() + amount * 7);
      break;
    case 'month':
    case 'months':
      now.setMonth(now.getMonth() + amount);
      break;
  }
  
  return now;
}

// ============================================
// BUILD WHERE CLAUSE FROM FILTER RULES
// ============================================

function buildWhereClause(rules: FilterRules): any {
  const where: any = {};
  
  // Status (always active by default)
  where.status = rules.status || 'active';
  
  // Subscription tier
  if (rules.subscription_tier) {
    where.subscriptionTier = { in: rules.subscription_tier };
  }
  
  // Date created
  if (rules.date_created) {
    where.dateCreated = {};
    if (rules.date_created.gte) {
      where.dateCreated.gte = parseRelativeTime(rules.date_created.gte);
    }
    if (rules.date_created.lt) {
      where.dateCreated.lt = parseRelativeTime(rules.date_created.lt);
    }
  }
  
  // Last entry at
  if (rules.last_entry_at) {
    where.lastEntryAt = {};
    if (rules.last_entry_at.gte) {
      where.lastEntryAt.gte = parseRelativeTime(rules.last_entry_at.gte);
    }
    if (rules.last_entry_at.lt) {
      where.lastEntryAt.lt = parseRelativeTime(rules.last_entry_at.lt);
    }
  }
  
  // Entries count
  if (rules.entries_count) {
    where.entriesCount = {};
    if (rules.entries_count.gte !== undefined) {
      where.entriesCount.gte = rules.entries_count.gte;
    }
    if (rules.entries_count.lt !== undefined) {
      where.entriesCount.lt = rules.entries_count.lt;
    }
  }
  
  // Has voice entries
  if (rules.has_voice_entries === true) {
    where.voiceEntriesCount = { gt: 0 };
  }
  
  return where;
}

// ============================================
// GET SEGMENT USERS
// ============================================

/**
 * Get users matching a segment
 */
export async function getSegmentUsers(segmentId: string): Promise<SegmentUserResult> {
  const segment = await prisma.userSegment.findUnique({
    where: { id: segmentId },
  });
  
  if (!segment) {
    throw new Error(`Segment ${segmentId} not found`);
  }
  
  return getSegmentUsersByData(segment);
}

/**
 * Get users by segment slug
 */
export async function getSegmentUsersBySlug(slug: string): Promise<SegmentUserResult> {
  const segment = await prisma.userSegment.findUnique({
    where: { slug },
  });
  
  if (!segment) {
    throw new Error(`Segment with slug "${slug}" not found`);
  }
  
  return getSegmentUsersByData(segment);
}

/**
 * Core function to get users from segment data
 */
async function getSegmentUsersByData(segment: {
  id: string;
  segmentType: SegmentType;
  filterRules: any;
  staticUserIds: string[];
  slug: string;
}): Promise<SegmentUserResult> {
  let telegramIds: bigint[] = [];
  
  // Static segment — get users by IDs
  if (segment.segmentType === 'static' && segment.staticUserIds.length > 0) {
    const users = await prisma.user.findMany({
      where: {
        id: { in: segment.staticUserIds },
        status: 'active',
      },
      select: { telegramId: true },
    });
    telegramIds = users.map(u => u.telegramId);
  }
  // Dynamic/System segment — apply filter rules
  else if (segment.filterRules) {
    const where = buildWhereClause(segment.filterRules as FilterRules);
    const users = await prisma.user.findMany({
      where,
      select: { telegramId: true },
    });
    telegramIds = users.map(u => u.telegramId);
  }
  // System segments without filter rules (fallback)
  else if (segment.segmentType === 'system') {
    // Handle legacy system segments
    switch (segment.slug) {
      case 'all':
        const allUsers = await prisma.user.findMany({
          where: { status: 'active' },
          select: { telegramId: true },
        });
        telegramIds = allUsers.map(u => u.telegramId);
        break;
      case 'premium':
        const premiumUsers = await prisma.user.findMany({
          where: { status: 'active', subscriptionTier: { in: ['basic', 'premium'] } },
          select: { telegramId: true },
        });
        telegramIds = premiumUsers.map(u => u.telegramId);
        break;
      case 'free':
        const freeUsers = await prisma.user.findMany({
          where: { status: 'active', subscriptionTier: 'free' },
          select: { telegramId: true },
        });
        telegramIds = freeUsers.map(u => u.telegramId);
        break;
    }
  }
  
  // Update cached count
  await prisma.userSegment.update({
    where: { id: segment.id },
    data: {
      cachedUserCount: telegramIds.length,
      cacheUpdatedAt: new Date(),
    },
  });
  
  dbLogger.info({ 
    segmentId: segment.id, 
    slug: segment.slug, 
    userCount: telegramIds.length 
  }, 'Segment users calculated');
  
  return {
    telegramIds,
    count: telegramIds.length,
  };
}

// ============================================
// SEGMENT MANAGEMENT
// ============================================

/**
 * Get all segments with cached counts
 */
export async function getAllSegments() {
  return prisma.userSegment.findMany({
    orderBy: [
      { isSystem: 'desc' },
      { name: 'asc' },
    ],
  });
}

/**
 * Get segment by ID
 */
export async function getSegmentById(id: string) {
  return prisma.userSegment.findUnique({
    where: { id },
  });
}

/**
 * Get segment by slug
 */
export async function getSegmentBySlug(slug: string) {
  return prisma.userSegment.findUnique({
    where: { slug },
  });
}

/**
 * Add user to static segment
 */
export async function addUserToSegment(segmentSlug: string, userId: string): Promise<void> {
  const segment = await prisma.userSegment.findUnique({
    where: { slug: segmentSlug },
  });
  
  if (!segment) {
    throw new Error(`Segment "${segmentSlug}" not found`);
  }
  
  if (segment.segmentType !== 'static') {
    throw new Error(`Cannot manually add users to ${segment.segmentType} segment`);
  }
  
  const currentIds = segment.staticUserIds || [];
  if (!currentIds.includes(userId)) {
    await prisma.userSegment.update({
      where: { slug: segmentSlug },
      data: {
        staticUserIds: [...currentIds, userId],
      },
    });
    dbLogger.info({ segmentSlug, userId }, 'User added to segment');
  }
}

/**
 * Remove user from static segment
 */
export async function removeUserFromSegment(segmentSlug: string, userId: string): Promise<void> {
  const segment = await prisma.userSegment.findUnique({
    where: { slug: segmentSlug },
  });
  
  if (!segment) {
    throw new Error(`Segment "${segmentSlug}" not found`);
  }
  
  if (segment.segmentType !== 'static') {
    throw new Error(`Cannot manually remove users from ${segment.segmentType} segment`);
  }
  
  const currentIds = segment.staticUserIds || [];
  await prisma.userSegment.update({
    where: { slug: segmentSlug },
    data: {
      staticUserIds: currentIds.filter(id => id !== userId),
    },
  });
  dbLogger.info({ segmentSlug, userId }, 'User removed from segment');
}

/**
 * Refresh cached user count for all segments
 */
export async function refreshAllSegmentCounts(): Promise<void> {
  const segments = await prisma.userSegment.findMany();
  
  for (const segment of segments) {
    try {
      await getSegmentUsersByData(segment);
    } catch (error) {
      dbLogger.error({ segmentId: segment.id, error }, 'Failed to refresh segment count');
    }
  }
  
  dbLogger.info({ segmentCount: segments.length }, 'All segment counts refreshed');
}

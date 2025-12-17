import re

# Read file
with open(r'server\prisma\schema.prisma.new', 'r', encoding='utf-8') as f:
    content = f.read()

# Add @@map for main models
mappings = [
    ('model broadcasts {', 'model Broadcast {'),
    ('model journal_entries {', 'model JournalEntry {'),
    ('model subscriptions {', 'model Subscription {'),
    ('model transactions {', 'model Transaction {'),
    ('model usage_logs {', 'model UsageLog {'),
    ('model users {', 'model User {'),
]

for old, new in mappings:
    content = content.replace(old, new)

# Add @@map attribute before @@schema for these models
models = ['Broadcast', 'JournalEntry', 'Subscription', 'Transaction', 'UsageLog', 'User']
for model in models:
    # Find model closing bracket before @@schema
    pattern = rf'(model {model} \{{.*?)(  @@schema\("app"\)\n\}})'
    table_name = {
        'Broadcast': 'broadcasts',
        'JournalEntry': 'journal_entries', 
        'Subscription': 'subscriptions',
        'Transaction': 'transactions',
        'UsageLog': 'usage_logs',
        'User': 'users'
    }[model]
    replacement = rf'\1  @@map("{table_name}")\n\2'
    content = re.sub(pattern, replacement, content, flags=re.DOTALL)

# Write back
with open(r'server\prisma\schema.prisma', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done! Fixed schema.prisma')

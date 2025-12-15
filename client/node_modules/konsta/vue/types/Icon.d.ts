import { ComponentOptionsMixin, DefineComponent, PropType, StyleValue, Ref } from 'vue';

declare const Icon: DefineComponent<
  {
    
    /**
     * Component's HTML Element
     */
    component: {
      type: StringConstructor;
      default: 'i';
    };

    /**
     * Icon badge
     */
    badge: {
      type: PropType<string | number>;
      
    };

    /**
     * Object with Tailwind CSS colors classes
     */
    badgeColors: {
      type: PropType<{
    
        /**
         * Badge bg color
         *
         * @default 'bg-primary'
         */
        bg?: string;
        /**
         * Badge text color
         *
         * @default 'text-white'
         */
        text?: string;
      
      }>;
      
    };
  },
  () => JSX.Element,
  unknown,
  {},
  {},
  ComponentOptionsMixin,
  ComponentOptionsMixin,
  {
    
  }
>;

export default Icon;
import { ComponentOptionsMixin, DefineComponent, PropType, StyleValue, Ref } from 'vue';

declare const Badge: DefineComponent<
  {
    
    /**
     * Component's HTML Element
     */
    component: {
      type: StringConstructor;
      default: 'span';
    };

    /**
     * Makes small badge
     */
    small: {
      type: BooleanConstructor;
      
    };

    /**
     * Object with Tailwind CSS colors classes
     */
    colors: {
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

export default Badge;
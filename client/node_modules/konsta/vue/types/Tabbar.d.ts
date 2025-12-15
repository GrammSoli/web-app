import { ComponentOptionsMixin, DefineComponent, PropType, StyleValue, Ref } from 'vue';

declare const Tabbar: DefineComponent<
  {
    
    /**
     * Enables Tabbar with labels
     */
    labels: {
      type: BooleanConstructor;
      default: false;
    };

    /**
     * Enables Tabbar with icons
     */
    icons: {
      type: BooleanConstructor;
      default: false;
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

export default Tabbar;
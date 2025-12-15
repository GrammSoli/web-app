import { ComponentOptionsMixin, DefineComponent, PropType, StyleValue, Ref } from 'vue';

declare const Actions: DefineComponent<
  {
    
    /**
     * Component's HTML Element
     */
    component: {
      type: StringConstructor;
      default: 'div';
    };

    /**
     * Allows to open/close Action Sheet and set its initial state
     */
    opened: {
      type: BooleanConstructor;
      default: false;
    };

    /**
     * Enables Action Sheet backdrop (dark semi transparent layer behind)
     */
    backdrop: {
      type: BooleanConstructor;
      default: true;
    };
  },
  () => JSX.Element,
  unknown,
  {},
  {},
  ComponentOptionsMixin,
  ComponentOptionsMixin,
  {
    
    /**
     * Click handler on backdrop element
     */
    backdropclick: (e: any) => void;
    
  }
>;

export default Actions;
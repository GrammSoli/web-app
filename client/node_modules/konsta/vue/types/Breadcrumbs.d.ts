import { ComponentOptionsMixin, DefineComponent, PropType, StyleValue, Ref } from 'vue';

declare const Breadcrumbs: DefineComponent<
  {
    
    /**
     * Component's HTML Element
     */
    component: {
      type: StringConstructor;
      default: 'div';
    };

    /**
     * Font size in iOS theme
     */
    fontSizeIos: {
      type: StringConstructor;
      default: 'text-[17px]';
    };

    /**
     * Font size in Material theme
     */
    fontSizeMaterial: {
      type: StringConstructor;
      default: 'text-[14px]';
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

export default Breadcrumbs;
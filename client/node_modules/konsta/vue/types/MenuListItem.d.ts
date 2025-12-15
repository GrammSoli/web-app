import { ComponentOptionsMixin, DefineComponent, PropType, StyleValue, Ref } from 'vue';

declare const MenuListItem: DefineComponent<
  {
    
    /**
     * Makes menu list item highlighted (active)
     */
    active: {
      type: BooleanConstructor;
      default: false;
    };

    /**
     * Menu list item link's `href` attribute
     */
    href: {
      type: PropType<string | boolean>;
      
    };

    /**
     * Content of the menu list item "subtitle" area
     */
    subtitle: {
      type: PropType<string | number>;
      
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

export default MenuListItem;
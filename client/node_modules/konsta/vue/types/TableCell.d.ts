import { ComponentOptionsMixin, DefineComponent, PropType, StyleValue, Ref } from 'vue';

declare const TableCell: DefineComponent<
  {
    
    /**
     * Is located inside the TableHead
     */
    header: {
      type: BooleanConstructor;
      
    };

    /**
     * Object with Tailwind CSS colors classes
     */
    colors: {
      type: PropType<{
    
        /**
         * Table Cell header text color
         *
         * @default 'text-black/45 dark:text-white/55'
         */
        textHeaderIos?: string;
        /**
         * Table Cell header text color
         *
         * @default 'text-md-light-on-surface-variant dark:text-md-dark-on-surface-variant'
         */
        textHeaderMaterial?: string;
      
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

export default TableCell;
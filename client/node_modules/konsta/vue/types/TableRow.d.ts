import { ComponentOptionsMixin, DefineComponent, PropType, StyleValue, Ref } from 'vue';

declare const TableRow: DefineComponent<
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
         * Table Row hover bg color
         *
         * @default 'hover:bg-black/5 dark:hover:bg-white/10'
         */
        bgIos?: string;
        /**
         * Table Row hover bg color
         *
         * @default 'hover:bg-md-light-secondary-container dark:hover:bg-md-dark-secondary-container'
         */
        bgMaterial?: string;
        /**
         * Table Row divider color
         *
         * @default 'border-md-light-outline dark:border-md-dark-outline'
         */
        dividerMaterial?: string;
      
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

export default TableRow;
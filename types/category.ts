export type CategoryType = "income" | "expense" | "both";

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  color?: string;
  vehicleLinked?: boolean;
  propertyLinked?: boolean;
  archived?: boolean;
}

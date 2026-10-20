import "react-native";

declare module "react-native" {
  interface ViewProps {
    dataSet?: Record<string, string | number | boolean | undefined>;
  }
  interface TextProps {
    dataSet?: Record<string, string | number | boolean | undefined>;
  }
}

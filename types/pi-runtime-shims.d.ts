declare module "@earendil-works/pi-coding-agent" {
  export type ExtensionAPI = any;
  export type ExtensionContext = any;
  export function isToolCallEventType(toolName: string, event: any): boolean;
}

declare module "@earendil-works/pi-ai" {
  export const StringEnum: any;
}

declare module "typebox" {
  export const Type: any;
}

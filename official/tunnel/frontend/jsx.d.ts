// JSX goes to window.Kubek.React through h, the panel React types are not bundled
declare namespace JSX {
  type Element = any;
  interface IntrinsicElements {
    [name: string]: any;
  }
  interface ElementChildrenAttribute {
    children: unknown;
  }
}

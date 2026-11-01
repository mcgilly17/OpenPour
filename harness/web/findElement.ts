/** The element `selector` matches, checked to be a `type`; the page's own markup must have it. */
export function findElement<T extends Element>(
  parent: ParentNode,
  selector: string,
  type: { new (): T; prototype: T },
): T {
  const element = parent.querySelector(selector);
  if (!(element instanceof type)) throw new Error(`harness markup has no ${type.name} ${selector}`);
  return element;
}

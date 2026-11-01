import { useBasket } from './store';
import { parse, serialize } from './url';

/**
 * Loads the configuration from the address bar once, then keeps the address
 * bar in sync so the current basket can be shared as a link.
 */
export function startUrlSync(): () => void {
  if (window.location.search) {
    const { params, notices } = parse(window.location.search);
    useBasket.getState().load(params, notices);
  }
  const write = () => {
    const query = serialize(useBasket.getState().params);
    const url = `${window.location.pathname}?${query}${window.location.hash}`;
    window.history.replaceState(null, '', url);
  };
  write();
  return useBasket.subscribe((s, prev) => {
    if (s.params !== prev.params) write();
  });
}

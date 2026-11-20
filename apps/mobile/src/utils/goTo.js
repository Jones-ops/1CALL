/**
 * Go to a screen in the current stack: return to it if it is already open
 * further down (React Navigation 7's navigate() no longer goes back), or
 * open it on top otherwise.
 */
export function goTo(navigation, name, params) {
  const routes = navigation.getState()?.routes ?? [];
  if (routes.some((r) => r.name === name)) navigation.popTo(name, params);
  else navigation.navigate(name, params);
}

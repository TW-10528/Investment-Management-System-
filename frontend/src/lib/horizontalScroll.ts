/**
 * Horizontal drag scrolling utility for tables
 * Enables mouse drag to scroll left/right on table containers
 */

export function enableHorizontalDragScroll(element: HTMLElement | null) {
  if (!element) return;

  let isPressed = false;
  let startX = 0;
  let scrollLeft = 0;

  const onMouseDown = (e: MouseEvent) => {
    // Only drag on primary button (left mouse)
    if (e.button !== 0) return;

    isPressed = true;
    startX = e.clientX;
    scrollLeft = element.scrollLeft;
    element.style.userSelect = 'none';
  };

  const onMouseLeave = () => {
    isPressed = false;
    element.style.userSelect = 'auto';
  };

  const onMouseUp = () => {
    isPressed = false;
    element.style.userSelect = 'auto';
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!isPressed) return;

    e.preventDefault();
    const x = e.clientX;
    const walk = x - startX;
    element.scrollLeft = scrollLeft - walk;
  };

  element.addEventListener('mousedown', onMouseDown);
  element.addEventListener('mouseleave', onMouseLeave);
  element.addEventListener('mouseup', onMouseUp);
  element.addEventListener('mousemove', onMouseMove);

  return () => {
    element.removeEventListener('mousedown', onMouseDown);
    element.removeEventListener('mouseleave', onMouseLeave);
    element.removeEventListener('mouseup', onMouseUp);
    element.removeEventListener('mousemove', onMouseMove);
  };
}

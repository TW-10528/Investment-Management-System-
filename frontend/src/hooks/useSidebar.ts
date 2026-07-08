import { useContext } from 'react';
import { SidebarContext } from '../components/Layout';

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within Layout component');
  }
  return context;
}

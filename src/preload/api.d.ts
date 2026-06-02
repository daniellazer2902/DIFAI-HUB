import type { Hub } from './index'

declare global {
  interface Window {
    hub: Hub
  }
}

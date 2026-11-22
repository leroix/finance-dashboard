import { Shell } from './components/Shell.tsx'
import { StoreProvider } from './state/store.tsx'

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}

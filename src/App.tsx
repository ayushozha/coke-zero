import { Brigade } from './pages/Brigade'
import { Operator } from './pages/Operator'
import './App.css'

function App() {
  const path = window.location.pathname

  return path.startsWith('/operator') ? <Operator /> : <Brigade />
}

export default App

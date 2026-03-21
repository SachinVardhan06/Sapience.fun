import CommingSoon from './pages/comingsoon/commingsoon'
import { Navigate, Route, Routes } from 'react-router-dom'

function App() {
  return (
    <Routes>
      <Route path="/access" element={<CommingSoon />} />
      <Route path="/" element={<Navigate to="/access" replace />} />
      <Route path="*" element={<Navigate to="/access" replace />} />
    </Routes>
  )
}

export default App

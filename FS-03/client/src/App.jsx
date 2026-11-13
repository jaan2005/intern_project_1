import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Nav, RequireAuth } from './components/ui.jsx';
import Catalog from './pages/Catalog.jsx';
import { Login, Register } from './pages/Auth.jsx';
import CourseDetail from './pages/CourseDetail.jsx';
import Learn from './pages/Learn.jsx';
import MyLearning from './pages/MyLearning.jsx';
import { MockCheckout, PaymentSuccess, Verify } from './pages/Misc.jsx';
import Teach from './pages/Teach.jsx';
import CourseEditor from './pages/CourseEditor.jsx';
import Earnings from './pages/Earnings.jsx';
import Admin from './pages/Admin.jsx';
const LiveRoom = lazy(() => import('./pages/LiveRoom.jsx')); // LiveKit is large: load it only when a class is opened

const teacher = ['instructor', 'admin'];

export default function App() {
  return (
    <>
      <Nav />
      <main className="page">
        <Suspense fallback={<p className="muted">Loading…</p>}>
        <Routes>
          <Route path="/" element={<Catalog />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/courses/:id" element={<CourseDetail />} />
          <Route path="/verify/:certId" element={<Verify />} />
          <Route path="/learn/:id" element={<RequireAuth><Learn /></RequireAuth>} />
          <Route path="/live/:id" element={<RequireAuth><LiveRoom /></RequireAuth>} />
          <Route path="/my-learning" element={<RequireAuth roles={['student']}><MyLearning /></RequireAuth>} />
          <Route path="/mock-checkout" element={<RequireAuth><MockCheckout /></RequireAuth>} />
          <Route path="/payment/success" element={<RequireAuth><PaymentSuccess /></RequireAuth>} />
          <Route path="/teach" element={<RequireAuth roles={teacher}><Teach /></RequireAuth>} />
          <Route path="/teach/earnings" element={<RequireAuth roles={teacher}><Earnings /></RequireAuth>} />
          <Route path="/teach/courses/:id" element={<RequireAuth roles={teacher}><CourseEditor /></RequireAuth>} />
          <Route path="/admin" element={<RequireAuth roles={['admin']}><Admin /></RequireAuth>} />
          <Route path="*" element={<p>Page not found.</p>} />
        </Routes>
        </Suspense>
      </main>
    </>
  );
}

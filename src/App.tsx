import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { GuestsProvider } from '@/hooks/useGuests';
import { DesignationsProvider } from '@/hooks/useDesignations';
import { UsersProvider } from '@/hooks/useUsers';
import { AssignableItemsProvider } from '@/hooks/useAssignableItems';
import { CoordinatorsProvider } from '@/hooks/useCoordinators';
import { AuditTrailProvider } from '@/hooks/useAuditTrail';
import { Toaster } from 'sonner';

import LandingPage from '@/pages/LandingPage';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import GuestsPage from '@/pages/GuestsPage';
import NewGuestPage from '@/pages/NewGuestPage';
import UsersPage from '@/pages/UsersPage';
import DesignationListPage from '@/pages/DesignationListPage';
import CountriesDepartmentsPage from '@/pages/CountriesDepartmentsPage';
import CoordinatorPendingPage from '@/pages/CoordinatorPendingPage';
import CoordinatorSubmittedPage from '@/pages/CoordinatorSubmittedPage';
import CoordinatorAuditTrailPage from '@/pages/CoordinatorAuditTrailPage';

function ProtectedRoute({ children, requiredRoles }: { children: React.ReactNode; requiredRoles?: string[] }) {
  const { isAuthenticated, user } = useAuth();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  if (requiredRoles && user && !requiredRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/guests"
        element={
          <ProtectedRoute>
            <GuestsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/guests/new"
        element={
          <ProtectedRoute requiredRoles={['coordinator', 'super-admin', 'desk-in-charge']}>
            <NewGuestPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute requiredRoles={['super-admin']}>
            <UsersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/designations"
        element={
          <ProtectedRoute requiredRoles={['super-admin']}>
            <DesignationListPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/countries-departments"
        element={
          <ProtectedRoute requiredRoles={['super-admin']}>
            <CountriesDepartmentsPage />
          </ProtectedRoute>
        }
      />
      <Route path="/coordinator/pending" element={<ProtectedRoute requiredRoles={['super-admin','coordinator']}><CoordinatorPendingPage /></ProtectedRoute>} />
      <Route path="/coordinator/submitted" element={<ProtectedRoute requiredRoles={['super-admin','coordinator']}><CoordinatorSubmittedPage /></ProtectedRoute>} />
      <Route path="/coordinator/audit-trail" element={<ProtectedRoute requiredRoles={['super-admin','coordinator']}><CoordinatorAuditTrailPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <UsersProvider>
        <CoordinatorsProvider>
        <AssignableItemsProvider>
        <DesignationsProvider>
          <AuditTrailProvider>
          <GuestsProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
            <Toaster position="top-right" />
          </GuestsProvider>
          </AuditTrailProvider>
        </DesignationsProvider>
        </AssignableItemsProvider>
        </CoordinatorsProvider>
      </UsersProvider>
    </AuthProvider>
  );
}

export default App;

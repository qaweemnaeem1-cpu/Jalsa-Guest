import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { GuestsProvider } from '@/hooks/useGuests';
import { DesignationsProvider } from '@/hooks/useDesignations';
import { UsersProvider } from '@/hooks/useUsers';
import { AssignableItemsProvider } from '@/hooks/useAssignableItems';
import { CoordinatorsProvider } from '@/hooks/useCoordinators';
import { AuditTrailProvider } from '@/hooks/useAuditTrail';
import { AuditTrail2Provider } from '@/hooks/useAuditTrail2';
import { DepartmentsProvider } from '@/hooks/useDepartments';
import { RoomsProvider } from '@/hooks/useRooms';
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
import CoordinatorRejectedPage from '@/pages/CoordinatorRejectedPage';
import CoordinatorAuditTrailPage from '@/pages/CoordinatorAuditTrailPage';
import GuestsToReviewPage from '@/pages/GuestsToReviewPage';
import DeskAuditTrailPage from '@/pages/DeskAuditTrailPage';
import DeskProcessedPage from '@/pages/DeskProcessedPage';
import DeskRejectedPage from '@/pages/DeskRejectedPage';
import AdminAuditTrailPage from '@/pages/AdminAuditTrailPage';
import DeptDashboardPage from '@/pages/DeptDashboardPage';
import DeptIncomingPage from '@/pages/DeptIncomingPage';
import DeptPlacedPage from '@/pages/DeptPlacedPage';
import DeptSubUsersPage from '@/pages/DeptSubUsersPage';
import DeptLocationsPage from '@/pages/DeptLocationsPage';
import DeptMessagesPage from '@/pages/DeptMessagesPage';
import LocationDashboardPage from '@/pages/LocationDashboardPage';
import LocationIncomingPage from '@/pages/LocationIncomingPage';
import LocationRoomsPage from '@/pages/LocationRoomsPage';
import LocationAccommodatedPage from '@/pages/LocationAccommodatedPage';
import LocationMessagesPage from '@/pages/LocationMessagesPage';
import AdminRoomsPage from '@/pages/AdminRoomsPage';

function ProtectedRoute({ children, requiredRoles }: { children: React.ReactNode; requiredRoles?: string[] }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#2D5A45] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRoles && user && !requiredRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function GuestsPageOrRedirect() {
  const { user } = useAuth();
  if (user?.role === 'coordinator') return <Navigate to="/coordinator/submitted" replace />;
  return <GuestsPage />;
}

function DashboardOrRedirect() {
  const { user } = useAuth();
  if (user?.role === 'department-head') return <Navigate to="/dept/dashboard" replace />;
  if (user?.role === 'location-manager') return <Navigate to="/location/dashboard" replace />;
  return <DashboardPage />;
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
            <DashboardOrRedirect />
          </ProtectedRoute>
        }
      />
      <Route
        path="/guests"
        element={
          <ProtectedRoute>
            <GuestsPageOrRedirect />
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
      <Route path="/coordinator/rejected" element={<ProtectedRoute requiredRoles={['super-admin','coordinator']}><CoordinatorRejectedPage /></ProtectedRoute>} />
      <Route path="/coordinator/audit-trail" element={<Navigate to="/coordinator/messages" replace />} />
      <Route path="/coordinator/messages" element={<ProtectedRoute requiredRoles={['super-admin','coordinator']}><CoordinatorAuditTrailPage /></ProtectedRoute>} />
      <Route path="/desk/review" element={<ProtectedRoute requiredRoles={['desk-in-charge','super-admin']}><GuestsToReviewPage /></ProtectedRoute>} />
      <Route path="/desk/approved" element={<Navigate to="/desk/processed" replace />} />
      <Route path="/desk/processed" element={<ProtectedRoute requiredRoles={['desk-in-charge','super-admin']}><DeskProcessedPage /></ProtectedRoute>} />
      <Route path="/desk/rejected" element={<ProtectedRoute requiredRoles={['desk-in-charge','super-admin']}><DeskRejectedPage /></ProtectedRoute>} />
      <Route path="/desk/audit-trail" element={<Navigate to="/desk/messages" replace />} />
      <Route path="/desk/messages" element={<ProtectedRoute requiredRoles={['desk-in-charge','super-admin']}><DeskAuditTrailPage /></ProtectedRoute>} />
      <Route path="/admin/rooms" element={<ProtectedRoute requiredRoles={['super-admin']}><AdminRoomsPage /></ProtectedRoute>} />
      <Route path="/admin/audit-trail" element={<ProtectedRoute requiredRoles={['super-admin']}><AdminAuditTrailPage /></ProtectedRoute>} />
      <Route path="/dept/dashboard" element={<ProtectedRoute requiredRoles={['department-head', 'super-admin']}><DeptDashboardPage /></ProtectedRoute>} />
      <Route path="/dept/incoming" element={<ProtectedRoute requiredRoles={['department-head', 'super-admin']}><DeptIncomingPage /></ProtectedRoute>} />
      <Route path="/dept/placed" element={<ProtectedRoute requiredRoles={['department-head', 'super-admin']}><DeptPlacedPage /></ProtectedRoute>} />
      <Route path="/dept/sub-users" element={<ProtectedRoute requiredRoles={['department-head', 'super-admin']}><DeptSubUsersPage /></ProtectedRoute>} />
      <Route path="/dept/locations" element={<ProtectedRoute requiredRoles={['department-head', 'super-admin']}><DeptLocationsPage /></ProtectedRoute>} />
      <Route path="/dept/messages" element={<ProtectedRoute requiredRoles={['department-head', 'super-admin']}><DeptMessagesPage /></ProtectedRoute>} />
      <Route path="/location/dashboard" element={<ProtectedRoute requiredRoles={['location-manager', 'super-admin']}><LocationDashboardPage /></ProtectedRoute>} />
      <Route path="/location/incoming" element={<ProtectedRoute requiredRoles={['location-manager', 'super-admin']}><LocationIncomingPage /></ProtectedRoute>} />
      <Route path="/location/rooms" element={<ProtectedRoute requiredRoles={['location-manager', 'super-admin']}><LocationRoomsPage /></ProtectedRoute>} />
      <Route path="/location/accommodated" element={<ProtectedRoute requiredRoles={['location-manager', 'super-admin']}><LocationAccommodatedPage /></ProtectedRoute>} />
      <Route path="/location/messages" element={<ProtectedRoute requiredRoles={['location-manager', 'super-admin']}><LocationMessagesPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <UsersProvider>
        <DepartmentsProvider>
        <CoordinatorsProvider>
        <AssignableItemsProvider>
        <DesignationsProvider>
          <AuditTrailProvider>
          <AuditTrail2Provider>
          <GuestsProvider>
          <RoomsProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
            <Toaster position="top-right" />
          </RoomsProvider>
          </GuestsProvider>
          </AuditTrail2Provider>
          </AuditTrailProvider>
        </DesignationsProvider>
        </AssignableItemsProvider>
        </CoordinatorsProvider>
        </DepartmentsProvider>
      </UsersProvider>
    </AuthProvider>
  );
}

export default App;

import { useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
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
import { TransportDeptsProvider } from '@/hooks/useTransportDepartments';
import { DarkModeProvider } from '@/contexts/DarkModeContext';
import { useIsMobile } from '@/hooks/useIsMobile';
import { Toaster, toast } from 'sonner';
import { useSessionTimeout } from '@/hooks/useSessionTimeout';
import { SessionWarningDialog } from '@/components/SessionWarningDialog';

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
import DeskMulaqatPage from '@/pages/DeskMulaqatPage';
import AdminMulaqatPage from '@/pages/AdminMulaqatPage';
import DriverDashboardPage from '@/pages/DriverDashboardPage';
import DriverTasksPage from '@/pages/DriverTasksPage';
import DriverCompletedPage from '@/pages/DriverCompletedPage';
import DriverVehiclePage from '@/pages/DriverVehiclePage';
import DriverAllDriversPage from '@/pages/DriverAllDriversPage';
import DriverAllTasksPage from '@/pages/DriverAllTasksPage';
import DriverVehiclesPage from '@/pages/DriverVehiclesPage';
import DriverSchedulePage from '@/pages/DriverSchedulePage';
import AdminDriversPage from '@/pages/AdminDriversPage';
import TransportDashboardPage from '@/pages/TransportDashboardPage';
import TransportGuestsPage from '@/pages/TransportGuestsPage';
import TransportDriversPage from '@/pages/TransportDriversPage';
import TransportMessagesPage from '@/pages/TransportMessagesPage';
import TransportTasksPage from '@/pages/TransportTasksPage';
import TransportSchedulePage from '@/pages/TransportSchedulePage';
import TransportVehiclesPage from '@/pages/TransportVehiclesPage';
import TransportCompletedPage from '@/pages/TransportCompletedPage';
import DriverMessagesPage from '@/pages/DriverMessagesPage';
// Mobile driver pages
import MobileDriverHomePage from '@/pages/MobileDriverHomePage';
import MobileDriverTasksPage from '@/pages/MobileDriverTasksPage';
import MobileDriverTaskDetailPage from '@/pages/MobileDriverTaskDetailPage';
import MobileDriverMessagesPage from '@/pages/MobileDriverMessagesPage';
import MobileDriverVehiclePage from '@/pages/MobileDriverVehiclePage';
import MobileDriverProfilePage from '@/pages/MobileDriverProfilePage';
// Mobile transport head pages
import MobileTransportHomePage from '@/pages/MobileTransportHomePage';
import MobileTransportTeamPage from '@/pages/MobileTransportTeamPage';
import MobileTransportTasksPage from '@/pages/MobileTransportTasksPage';
import MobileTransportMessagesPage from '@/pages/MobileTransportMessagesPage';
import MobileTransportFleetPage from '@/pages/MobileTransportFleetPage';
import MobileTransportProfilePage from '@/pages/MobileTransportProfilePage';

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
  const isMobile = useIsMobile();
  if (user?.role === 'department-head') return <Navigate to="/dept/dashboard" replace />;
  if (user?.role === 'location-manager') return <Navigate to="/location/dashboard" replace />;
  if (user?.role === 'driver') {
    // Transport Department Heads get their own portal
    if (user.isHeadDriver && user.transportDepartmentId) {
      if (isMobile) return <Navigate to="/transport-m/home" replace />;
      return <Navigate to="/transport/dashboard" replace />;
    }
    // Regular drivers: mobile Uber-style or desktop
    if (isMobile) return <Navigate to="/driver/home" replace />;
    return <Navigate to="/driver/dashboard" replace />;
  }
  return <DashboardPage />;
}

const SESSION_KEY = 'jalsa_guest_session';

/** Runs inside BrowserRouter + AuthProvider — wires up inactivity timeout. */
function SessionManager() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleAutoLogout = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    logout();
    navigate('/login', { replace: true });
    toast.error('You have been logged out due to 45 minutes of inactivity');
  }, [logout, navigate]);

  useSessionTimeout(handleAutoLogout, !!user);

  return <SessionWarningDialog />;
}

/** Renders `mobile` on small viewports, `desktop` otherwise. Mobile variant is wrapped in DarkModeProvider. */
function MobileOrDesktopDriverRoute({ mobile, desktop }: { mobile: React.ReactNode; desktop: React.ReactNode }) {
  const isMobile = useIsMobile();
  if (isMobile) return <DarkModeProvider>{mobile}</DarkModeProvider>;
  return <>{desktop}</>;
}

function AppRoutes() {
  return (
    <>
      <SessionManager />
      <Routes>
      <Route path="/" element={<LoginPage />} />
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
        path="/desk/register"
        element={
          <ProtectedRoute requiredRoles={['desk-in-charge']}>
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
      <Route path="/desk/mulaqat" element={<ProtectedRoute requiredRoles={['desk-in-charge','super-admin']}><DeskMulaqatPage /></ProtectedRoute>} />
      <Route path="/admin/rooms" element={<ProtectedRoute requiredRoles={['super-admin']}><AdminRoomsPage /></ProtectedRoute>} />
      <Route path="/admin/mulaqat" element={<ProtectedRoute requiredRoles={['super-admin']}><AdminMulaqatPage /></ProtectedRoute>} />
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
      <Route path="/admin/drivers"    element={<ProtectedRoute requiredRoles={['super-admin']}><AdminDriversPage /></ProtectedRoute>} />
      <Route path="/driver/dashboard"   element={<ProtectedRoute requiredRoles={['driver']}><DriverDashboardPage /></ProtectedRoute>} />
      <Route path="/driver/completed"   element={<ProtectedRoute requiredRoles={['driver']}><DriverCompletedPage /></ProtectedRoute>} />
      <Route path="/driver/all-drivers" element={<ProtectedRoute requiredRoles={['driver']}><DriverAllDriversPage /></ProtectedRoute>} />
      <Route path="/driver/all-tasks"   element={<ProtectedRoute requiredRoles={['driver']}><DriverAllTasksPage /></ProtectedRoute>} />
      <Route path="/driver/schedule"    element={<ProtectedRoute requiredRoles={['driver']}><DriverSchedulePage /></ProtectedRoute>} />
      <Route path="/driver/vehicles"    element={<ProtectedRoute requiredRoles={['driver']}><DriverVehiclesPage /></ProtectedRoute>} />
      {/* Routes that serve mobile or desktop variants based on viewport */}
      <Route path="/driver/tasks"    element={<ProtectedRoute requiredRoles={['driver']}><MobileOrDesktopDriverRoute mobile={<MobileDriverTasksPage />} desktop={<DriverTasksPage />} /></ProtectedRoute>} />
      <Route path="/driver/vehicle"  element={<ProtectedRoute requiredRoles={['driver']}><MobileOrDesktopDriverRoute mobile={<MobileDriverVehiclePage />} desktop={<DriverVehiclePage />} /></ProtectedRoute>} />
      <Route path="/driver/messages" element={<ProtectedRoute requiredRoles={['driver']}><MobileOrDesktopDriverRoute mobile={<MobileDriverMessagesPage />} desktop={<DriverMessagesPage />} /></ProtectedRoute>} />
      {/* Mobile-only driver routes */}
      <Route path="/driver/home"    element={<ProtectedRoute requiredRoles={['driver']}><DarkModeProvider><MobileDriverHomePage /></DarkModeProvider></ProtectedRoute>} />
      <Route path="/driver/profile" element={<ProtectedRoute requiredRoles={['driver']}><DarkModeProvider><MobileDriverProfilePage /></DarkModeProvider></ProtectedRoute>} />
      <Route path="/driver/task/:id" element={<ProtectedRoute requiredRoles={['driver']}><DarkModeProvider><MobileDriverTaskDetailPage /></DarkModeProvider></ProtectedRoute>} />
      {/* Transport Department Head portal */}
      <Route path="/transport/dashboard" element={<ProtectedRoute requiredRoles={['driver']}><TransportDashboardPage /></ProtectedRoute>} />
      <Route path="/transport/guests"    element={<ProtectedRoute requiredRoles={['driver']}><TransportGuestsPage /></ProtectedRoute>} />
      <Route path="/transport/drivers"   element={<ProtectedRoute requiredRoles={['driver']}><TransportDriversPage /></ProtectedRoute>} />
      <Route path="/transport/tasks"     element={<ProtectedRoute requiredRoles={['driver']}><TransportTasksPage /></ProtectedRoute>} />
      <Route path="/transport/schedule"  element={<ProtectedRoute requiredRoles={['driver']}><TransportSchedulePage /></ProtectedRoute>} />
      <Route path="/transport/vehicles"  element={<ProtectedRoute requiredRoles={['driver']}><TransportVehiclesPage /></ProtectedRoute>} />
      <Route path="/transport/completed" element={<ProtectedRoute requiredRoles={['driver']}><TransportCompletedPage /></ProtectedRoute>} />
      <Route path="/transport/messages"  element={<ProtectedRoute requiredRoles={['driver']}><TransportMessagesPage /></ProtectedRoute>} />
      {/* Mobile Transport Head portal */}
      <Route path="/transport-m/home"     element={<ProtectedRoute requiredRoles={['driver']}><DarkModeProvider><MobileTransportHomePage /></DarkModeProvider></ProtectedRoute>} />
      <Route path="/transport-m/team"     element={<ProtectedRoute requiredRoles={['driver']}><DarkModeProvider><MobileTransportTeamPage /></DarkModeProvider></ProtectedRoute>} />
      <Route path="/transport-m/tasks"    element={<ProtectedRoute requiredRoles={['driver']}><DarkModeProvider><MobileTransportTasksPage /></DarkModeProvider></ProtectedRoute>} />
      <Route path="/transport-m/messages" element={<ProtectedRoute requiredRoles={['driver']}><DarkModeProvider><MobileTransportMessagesPage /></DarkModeProvider></ProtectedRoute>} />
      <Route path="/transport-m/fleet"    element={<ProtectedRoute requiredRoles={['driver']}><DarkModeProvider><MobileTransportFleetPage /></DarkModeProvider></ProtectedRoute>} />
      <Route path="/transport-m/profile"  element={<ProtectedRoute requiredRoles={['driver']}><DarkModeProvider><MobileTransportProfilePage /></DarkModeProvider></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
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
          <TransportDeptsProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
            <Toaster position="top-right" />
          </TransportDeptsProvider>
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

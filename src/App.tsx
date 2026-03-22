import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { UserProvider, useUser } from "@/contexts/UserContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { CartProvider } from "@/contexts/CartContext";
import { UploadProvider } from "@/contexts/UploadContext";
import { NavigationProvider } from "@/contexts/NavigationContext";
import { InstallPrompt } from "@/components/InstallPrompt";
import { AppLoader } from "@/components/AppLoader";
import UploadProgressOverlay from "@/components/UploadProgressOverlay";
import { NotificationPermissionPrompt } from "@/components/NotificationPermissionPrompt";
import { IncomingHelperRequestAlert } from "@/components/safe/IncomingHelperRequestAlert";
import { cacheManager, isFilePickerActive } from "@/utils/cacheManager";
import { createIDBPersister, PERSIST_MAX_AGE, requestPersistentStorage } from "@/utils/queryPersister";
import Index from "./pages/Index";
import Notifications from "./pages/Notifications";
import Messages from "./pages/Messages";
import Shop from "./pages/Shop";
import Ask from "./pages/Ask";
import QuestionDetail from "./pages/QuestionDetail";
import AskProfile from "./pages/AskProfile";
import ProductDetail from "./pages/ProductDetail";
import SellerProfile from "./pages/SellerProfile";
import Cart from "./pages/Cart";
import { SOSSubCategories } from "./pages/SOSSubCategories";
import CircleDetailWrapper from "./components/CircleDetailWrapper";
import CirclePostDetail from "./pages/CirclePostDetail";
import PostDetail from "./pages/PostDetail";
import CreatePost from "./pages/CreatePost";
import CreateVideo from "./pages/CreateVideo";
import CreateCircle from "./pages/CreateCircle";
import CreateShop from "./pages/CreateShop";
import SellerDashboard from "./pages/SellerDashboard";
import OrderHistory from "./pages/OrderHistory";
import OrderDetail from "./pages/OrderDetail";
import Wishlist from "./pages/Wishlist";
import Disputes from "./pages/Disputes";
import ShopMessages from "./pages/ShopMessages";
import ShippingAddresses from "./pages/ShippingAddresses";
import Profile from "./pages/Profile";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import NotFound from "./pages/NotFound";
import UpdateNotifier from "@/components/UpdateNotifier";
import GlobalRealtimeListener from "@/components/GlobalRealtimeListener";
import VideoDetail from "./pages/VideoDetail";
import JoinCircle from "./pages/JoinCircle";
import EmailAddress from "./pages/EmailAddress";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminPosts from "./pages/admin/AdminPosts";
import AdminVideos from "./pages/admin/AdminVideos";
import AdminAlerts from "./pages/admin/AdminAlerts";
import AdminRoles from "./pages/admin/AdminRoles";
import AdminReports from "./pages/admin/AdminReports";
import AdminAppeals from "./pages/admin/AdminAppeals";
import AdminComments from "./pages/admin/AdminComments";
import AdminMessagesOversight from "./pages/admin/AdminMessagesOversight";
import AdminAnalytics from "./pages/admin/AdminAnalytics";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminAIModeration from "./pages/admin/AdminAIModeration";
import AdminAutoModeration from "./pages/admin/AdminAutoModeration";
import AdminBulkActions from "./pages/admin/AdminBulkActions";
import AdminWebhooks from "./pages/admin/AdminWebhooks";
import AdminEngagement from "./pages/admin/AdminEngagement";
import TestPush from "./pages/TestPush";
import AdminContentQueue from "./pages/admin/AdminContentQueue";
import AdminAuditLog from "./pages/admin/AdminAuditLog";
import AdminPlatformHealth from "./pages/admin/AdminPlatformHealth";
import AdminCommunication from "./pages/admin/AdminCommunication";
import AdminCircles from "./pages/admin/AdminCircles";
import AdminReporting from "./pages/admin/AdminReporting";
import AdminAskModeration from "./pages/admin/AdminAskModeration";
import AdminLiveStreams from "./pages/admin/AdminLiveStreams";
import AdminShopManagement from "./pages/admin/AdminShopManagement";
import AdminSafetyOperations from "./pages/admin/AdminSafetyOperations";
import AdminExpertVerification from "./pages/admin/AdminExpertVerification";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 60 * 24, // 24 hours — keep cached data alive for persistence
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});

const persister = createIDBPersister();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useUser();
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
};

const AppRoutes = () => {
  const location = useLocation();
  return (
    <Routes key={location.pathname}>
    <Route path="/login" element={<Login />} />
    <Route path="/signup" element={<Signup />} />
    <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
    <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
    <Route path="/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
    <Route path="/messages/:conversationId" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
    <Route path="/shop" element={<ProtectedRoute><Shop activeTab="shop" onTabSelect={() => {}} onOpenCreate={() => {}} /></ProtectedRoute>} />
    <Route path="/shop/product/:id" element={<ProtectedRoute><ProductDetail /></ProtectedRoute>} />
    <Route path="/cart" element={<ProtectedRoute><Cart /></ProtectedRoute>} />
    <Route path="/orders" element={<ProtectedRoute><OrderHistory /></ProtectedRoute>} />
    <Route path="/order/:orderId" element={<ProtectedRoute><OrderDetail /></ProtectedRoute>} />
    <Route path="/seller/dashboard" element={<ProtectedRoute><SellerDashboard /></ProtectedRoute>} />
    <Route path="/wishlist" element={<ProtectedRoute><Wishlist /></ProtectedRoute>} />
    <Route path="/disputes" element={<ProtectedRoute><Disputes /></ProtectedRoute>} />
    <Route path="/seller/:sellerId" element={<ProtectedRoute><SellerProfile /></ProtectedRoute>} />
    <Route path="/shop/messages" element={<ProtectedRoute><ShopMessages /></ProtectedRoute>} />
    <Route path="/shop/messages/:conversationId" element={<ProtectedRoute><ShopMessages /></ProtectedRoute>} />
    <Route path="/shipping-addresses" element={<ProtectedRoute><ShippingAddresses /></ProtectedRoute>} />
    <Route path="/ask" element={<ProtectedRoute><Ask activeTab="ask" onTabSelect={() => {}} onOpenCreate={() => {}} /></ProtectedRoute>} />
    <Route path="/ask/profile" element={<ProtectedRoute><AskProfile /></ProtectedRoute>} />
    <Route path="/ask/question/:questionId" element={<ProtectedRoute><QuestionDetail /></ProtectedRoute>} />
    <Route path="/create/post" element={<ProtectedRoute><CreatePost /></ProtectedRoute>} />
    <Route path="/create/video" element={<ProtectedRoute><CreateVideo /></ProtectedRoute>} />
    <Route path="/create/circle" element={<ProtectedRoute><CreateCircle /></ProtectedRoute>} />
    <Route path="/create/shop" element={<ProtectedRoute><CreateShop /></ProtectedRoute>} />
    <Route path="/sos/:category" element={<ProtectedRoute><SOSSubCategories /></ProtectedRoute>} />
    <Route path="/post/:postId" element={<ProtectedRoute><PostDetail /></ProtectedRoute>} />
    <Route path="/circle/:id" element={<ProtectedRoute><CircleDetailWrapper /></ProtectedRoute>} />
    <Route path="/circle/:circleId/post/:postId" element={<ProtectedRoute><CirclePostDetail /></ProtectedRoute>} />
    <Route path="/profile/:username" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
    <Route path="/video/:videoId" element={<ProtectedRoute><VideoDetail /></ProtectedRoute>} />
    <Route path="/join/:inviteCode" element={<ProtectedRoute><JoinCircle /></ProtectedRoute>} />
    <Route path="/email-address" element={<ProtectedRoute><EmailAddress /></ProtectedRoute>} />
    <Route path="/test-push" element={<ProtectedRoute><TestPush /></ProtectedRoute>} />
    {/* Admin Dashboard Routes */}
    <Route path="/admin" element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
      <Route index element={<Navigate to="/admin/dashboard" replace />} />
      <Route path="dashboard" element={<AdminDashboard />} />
      <Route path="alerts" element={<AdminAlerts />} />
      <Route path="users" element={<AdminUsers />} />
      <Route path="roles" element={<AdminRoles />} />
      <Route path="posts" element={<AdminPosts />} />
      <Route path="videos" element={<AdminVideos />} />
      <Route path="comments" element={<AdminComments />} />
      <Route path="messages" element={<AdminMessagesOversight />} />
      <Route path="reports" element={<AdminReports />} />
      <Route path="appeals" element={<AdminAppeals />} />
      <Route path="analytics" element={<AdminAnalytics />} />
      <Route path="ai-moderation" element={<AdminAIModeration />} />
      <Route path="auto-moderation" element={<AdminAutoModeration />} />
      <Route path="bulk-actions" element={<AdminBulkActions />} />
      <Route path="webhooks" element={<AdminWebhooks />} />
      <Route path="engagement" element={<AdminEngagement />} />
      <Route path="content-queue" element={<AdminContentQueue />} />
      <Route path="audit-log" element={<AdminAuditLog />} />
      <Route path="platform-health" element={<AdminPlatformHealth />} />
      <Route path="communication" element={<AdminCommunication />} />
      <Route path="circles" element={<AdminCircles />} />
      <Route path="reporting" element={<AdminReporting />} />
      <Route path="ask-moderation" element={<AdminAskModeration />} />
      <Route path="live-streams" element={<AdminLiveStreams />} />
      <Route path="shop" element={<AdminShopManagement />} />
      <Route path="safety" element={<AdminSafetyOperations />} />
      <Route path="settings" element={<AdminSettings />} />
      <Route path="expert-verification" element={<AdminExpertVerification />} />
    </Route>
    <Route path="*" element={<NotFound />} />
  </Routes>
  );
};

const App = () => {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Request persistent storage so the OS doesn't evict our cache
        requestPersistentStorage();

        const versionChanged = cacheManager.checkVersion();
        
        if (versionChanged) {
          console.log('App version changed, clearing caches...');
          queryClient.clear();
          cacheManager.updateVersion();
        }
        
        await queryClient.invalidateQueries();
        
        if (import.meta.env.PROD && !isFilePickerActive()) {
          const hasUpdate = await cacheManager.checkForUpdates();
          if (hasUpdate) {
            console.log('Service worker update available');
          }
        }
      } catch (error) {
        console.error('Error initializing app:', error);
      }
    };

    initializeApp();
  }, []);

  if (isLoading) {
    return <AppLoader onComplete={() => setIsLoading(false)} />;
  }

  return (
    <ThemeProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: PERSIST_MAX_AGE,
          buster: import.meta.env.VITE_APP_VERSION || 'v1',
        }}
      >
        <UserProvider>
          <UploadProvider>
            <CartProvider>
              <TooltipProvider>
                <NavigationProvider>
                  <Toaster />
                  <Sonner />
                  <UpdateNotifier />
                  <GlobalRealtimeListener />
                  <InstallPrompt />
                  <UploadProgressOverlay />
                  <NotificationPermissionPrompt />
                  <IncomingHelperRequestAlert />
                  <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                    <AppRoutes />
                  </BrowserRouter>
                </NavigationProvider>
              </TooltipProvider>
            </CartProvider>
          </UploadProvider>
        </UserProvider>
      </PersistQueryClientProvider>
    </ThemeProvider>
  );
};

export default App;

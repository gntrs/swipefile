import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { DB_MODE } from '@/lib/db';
import { useSetup } from '@/lib/setup/SetupContext';
import Layout from '@/components/Layout';
import PageFallback from '@/components/PageFallback';
import Login from '@/pages/Login';
import Setup from '@/pages/Setup';
import { isOn } from '@/lib/modules';

// Every page except Login and Setup loads on demand, so the first paint only
// ships what the first screen needs.
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Library = lazy(() => import('@/pages/Library'));
const Compare = lazy(() => import('@/pages/Compare'));
const AddAd = lazy(() => import('@/pages/AddAd'));
const AdDetail = lazy(() => import('@/pages/AdDetail'));
const Posts = lazy(() => import('@/pages/Posts'));
const AddPost = lazy(() => import('@/pages/AddPost'));
const PostDetail = lazy(() => import('@/pages/PostDetail'));
const Outreach = lazy(() => import('@/pages/Outreach'));
const Competitors = lazy(() => import('@/pages/Competitors'));
const CompetitorDetail = lazy(() => import('@/pages/CompetitorDetail'));
const Insights = lazy(() => import('@/pages/Insights'));
const HookBank = lazy(() => import('@/pages/HookBank'));
const Briefs = lazy(() => import('@/pages/Briefs'));
const Intel = lazy(() => import('@/pages/Intel'));
const Availability = lazy(() => import('@/pages/Availability'));
const Profile = lazy(() => import('@/pages/Profile'));
const ImportPage = lazy(() => import('@/features/save/ImportPage'));
const CapturePage = lazy(() => import('@/features/capture/CapturePage'));
const CaptureSetup = lazy(() => import('@/features/capture/CaptureSetup'));

// The app mark, quiet, while auth and the setup check answer. The words stay
// for screen readers.
function Loading() {
  return (
    <div className="h-full flex items-center justify-center bg-canvas" aria-busy="true">
      <span className="sr-only">Loading...</span>
      <img src="/favicon.svg" alt="" aria-hidden="true" width="40" height="40" className="w-10 h-10 opacity-60" />
    </div>
  );
}

// Keeps every route behind /setup while the setup check has found something
// that stops the app from working (missing .env values, no tables...).
function SetupGate({ children }) {
  const { status, loading, checks } = useSetup();
  if (DB_MODE === 'misconfigured' || status === 'blocking') return <Navigate to="/setup" replace />;
  if (loading && checks.length === 0) return <Loading />;
  return children;
}

// Remembers where the visitor was going, so Login can send them back there.
function Protected({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

const page = (el) => <Suspense fallback={<PageFallback />}>{el}</Suspense>;

// A route whose module is off sends you to the library. Hidden, never deleted:
// the data stays and the page comes back when the module is switched on.
const gated = (module, el) => (isOn(module) ? page(el) : <Navigate to="/ads" replace />);

export default function App() {
  return (
    <Routes>
      <Route path="/setup" element={<Setup />} />
      <Route
        path="/login"
        element={
          <SetupGate>
            <Login />
          </SetupGate>
        }
      />
      <Route
        path="/"
        element={
          <SetupGate>
            <Protected>
              <Layout />
            </Protected>
          </SetupGate>
        }
      >
        {/* Home is the dashboard in every mode. /overview is its old address. */}
        <Route index element={page(<Dashboard />)} />
        <Route path="overview" element={page(<Dashboard />)} />
        <Route path="ads" element={page(<Library />)} />
        <Route path="ads/import" element={page(<ImportPage />)} />
        <Route path="compare" element={page(<Compare />)} />
        <Route path="ads/add" element={page(<AddAd />)} />
        <Route path="ad/:id" element={page(<AdDetail />)} />
        <Route path="posts" element={gated('team', <Posts />)} />
        <Route path="posts/add" element={gated('team', <AddPost />)} />
        <Route path="post/:id" element={gated('team', <PostDetail />)} />
        <Route path="outreach" element={gated('team', <Outreach />)} />
        <Route path="insights" element={page(<Insights />)} />
        <Route path="competitors" element={gated('competitors', <Competitors />)} />
        <Route path="competitors/:slug" element={gated('competitors', <CompetitorDetail />)} />
        <Route path="hooks" element={gated('hooks', <HookBank />)} />
        <Route path="briefs" element={gated('briefs', <Briefs />)} />
        <Route path="intel" element={gated('intel', <Intel />)} />
        <Route path="availability" element={gated('team', <Availability />)} />
        <Route path="profile" element={page(<Profile />)} />
        <Route path="capture/setup" element={page(<CaptureSetup />)} />
        {/* legacy v1 path */}
        <Route path="add" element={<Navigate to="/ads/add" replace />} />
      </Route>
      {/* The capture page opens in its own tab from the bookmarklet or the
          extension, so it sits outside the app shell but still needs a login. */}
      <Route
        path="/capture"
        element={
          <SetupGate>
            <Protected>{page(<CapturePage />)}</Protected>
          </SetupGate>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

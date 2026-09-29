import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { DB_MODE } from '@/lib/db';
import { useSetup } from '@/lib/setup/SetupContext';
import Layout from '@/components/Layout';
import PageFallback from '@/components/PageFallback';
import Login from '@/pages/Login';
import Setup from '@/pages/Setup';

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
const HookBank = lazy(() => import('@/pages/HookBank'));
const Briefs = lazy(() => import('@/pages/Briefs'));
const Intel = lazy(() => import('@/pages/Intel'));
const Availability = lazy(() => import('@/pages/Availability'));
const Profile = lazy(() => import('@/pages/Profile'));

function Loading() {
  return <div className="h-full flex items-center justify-center text-ink-soft">Loading...</div>;
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
        <Route index element={page(<Dashboard />)} />
        <Route path="overview" element={page(<Dashboard />)} />
        <Route path="ads" element={page(<Library />)} />
        <Route path="compare" element={page(<Compare />)} />
        <Route path="ads/add" element={page(<AddAd />)} />
        <Route path="ad/:id" element={page(<AdDetail />)} />
        <Route path="posts" element={page(<Posts />)} />
        <Route path="posts/add" element={page(<AddPost />)} />
        <Route path="post/:id" element={page(<PostDetail />)} />
        <Route path="outreach" element={page(<Outreach />)} />
        <Route path="competitors" element={page(<Competitors />)} />
        <Route path="hooks" element={page(<HookBank />)} />
        <Route path="briefs" element={page(<Briefs />)} />
        <Route path="intel" element={page(<Intel />)} />
        <Route path="availability" element={page(<Availability />)} />
        <Route path="profile" element={page(<Profile />)} />
        {/* legacy v1 path */}
        <Route path="add" element={<Navigate to="/ads/add" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

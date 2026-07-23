import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Layout from '@/components/Layout';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Library from '@/pages/Library';
import Compare from '@/pages/Compare';
import AddAd from '@/pages/AddAd';
import AdDetail from '@/pages/AdDetail';
import Posts from '@/pages/Posts';
import AddPost from '@/pages/AddPost';
import PostDetail from '@/pages/PostDetail';
import Outreach from '@/pages/Outreach';
import Competitors from '@/pages/Competitors';
import HookBank from '@/pages/HookBank';
import Briefs from '@/pages/Briefs';
import Intel from '@/pages/Intel';
import Availability from '@/pages/Availability';
import Profile from '@/pages/Profile';

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-ink-soft">Loading...</div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="ads" element={<Library />} />
        <Route path="compare" element={<Compare />} />
        <Route path="ads/add" element={<AddAd />} />
        <Route path="ad/:id" element={<AdDetail />} />
        <Route path="posts" element={<Posts />} />
        <Route path="posts/add" element={<AddPost />} />
        <Route path="post/:id" element={<PostDetail />} />
        <Route path="outreach" element={<Outreach />} />
        <Route path="competitors" element={<Competitors />} />
        <Route path="hooks" element={<HookBank />} />
        <Route path="briefs" element={<Briefs />} />
        <Route path="intel" element={<Intel />} />
        <Route path="availability" element={<Availability />} />
        <Route path="profile" element={<Profile />} />
        {/* legacy v1 path */}
        <Route path="add" element={<Navigate to="/ads/add" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

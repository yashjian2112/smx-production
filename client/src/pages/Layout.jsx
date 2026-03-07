import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { user, logout, isAdmin, isSupervisor } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Production Tracker</h1>
        <nav className="app-nav">
          <NavLink to="/" end>Dashboard</NavLink>
          {(isAdmin || isSupervisor) && <NavLink to="/employees">Employees</NavLink>}
          <NavLink to="/units">Daily Units</NavLink>
          <NavLink to="/controllers">Controllers</NavLink>
          <NavLink to="/reports">Reports</NavLink>
          {isAdmin && <NavLink to="/users">Users</NavLink>}
          <span className="user-badge">{user?.username} · {user?.role}</span>
          <button type="button" className="btn btn-ghost" onClick={handleLogout}>Logout</button>
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}

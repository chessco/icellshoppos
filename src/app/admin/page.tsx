"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function AdminDashboard() {
  return (
    <div className="app-shell">
      <nav className="sticky top-0 z-30 border-b border-[#eddac7] bg-[rgba(255,250,243,0.95)] px-6 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 text-sm text-[#5c4332]">
          <span className="font-bold">Super Admin Dashboard</span>
        </div>
      </nav>
      <div className="grid w-full md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="border-r border-[#e6d6c6] bg-[#fffaf3] p-6 min-h-screen">
          <ul className="space-y-4">
            <li><Link href="/admin/plans">Plans</Link></li>
            <li><Link href="/admin/subscriptions">Subscriptions</Link></li>
            <li><Link href="/admin/users">Users</Link></li>
            <li><Link href="/admin/organizations">Organizations</Link></li>
            <li><Link href="/admin/logs">System Logs</Link></li>
            <li><Link href="/admin/feature-flags">Feature Flags</Link></li>
            <li><Link href="/admin/email-settings">Email Settings</Link></li>
            <li><Link href="/admin/billing">Billing</Link></li>
            <li><Link href="/admin/support">Support Tools</Link></li>
          </ul>
        </aside>
        <main className="flex min-w-0 flex-col gap-8 px-6 py-10">
          <h1 className="text-2xl font-semibold text-[#1f1a16]">Welcome, Super Admin</h1>
          <p className="text-[#6a4d3a]">Select a section from the sidebar to manage your SaaS environment.</p>
        </main>
      </div>
    </div>
  );
}


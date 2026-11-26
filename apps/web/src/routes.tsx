import { lazy } from 'react';
import type { RouteObject } from 'react-router';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { NotFound } from './pages/stubs';

const Lab = lazy(() => import('./pages/Lab').then((m) => ({ default: m.Lab })));
const Run = lazy(() => import('./pages/Run').then((m) => ({ default: m.Run })));
const Check = lazy(() => import('./pages/Check').then((m) => ({ default: m.Check })));
const Board = lazy(() => import('./pages/Board').then((m) => ({ default: m.Board })));
const Scorecard = lazy(() => import('./pages/Scorecard').then((m) => ({ default: m.Scorecard })));
const Verify = lazy(() => import('./pages/Verify').then((m) => ({ default: m.Verify })));
const Try = lazy(() => import('./pages/Try').then((m) => ({ default: m.Try })));
const Docs = lazy(() => import('./pages/Docs').then((m) => ({ default: m.Docs })));
const How = lazy(() => import('./pages/How').then((m) => ({ default: m.How })));
const Device = lazy(() => import('./pages/Device').then((m) => ({ default: m.Device })));
const Traps = lazy(() => import('./pages/Traps').then((m) => ({ default: m.Traps })));
const TrapDetail = lazy(() => import('./pages/Traps').then((m) => ({ default: m.TrapDetail })));

export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'lab', element: <Lab /> },
      { path: 'run/:id', element: <Run /> },
      { path: 'card/:id', element: <Scorecard /> },
      { path: 'v/:id', element: <Verify /> },
      { path: 'verify', element: <Verify /> },
      { path: 'check', element: <Check /> },
      { path: 'try', element: <Try /> },
      { path: 'board', element: <Board /> },
      { path: 'traps', element: <Traps /> },
      { path: 'traps/:id', element: <TrapDetail /> },
      { path: 'how', element: <How /> },
      { path: 'docs', element: <Docs /> },
      { path: 'device', element: <Device /> },
      { path: '*', element: <NotFound /> },
    ],
  },
];

import { Hono } from 'hono';
import type { HonoEnv } from '../env';

export const githubRoutes = new Hono<HonoEnv>();

function ghHeaders(env: { GITHUB_TOKEN?: string }) {
  const token = env.GITHUB_TOKEN;
  const base: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'ChittyFinance/2.0',
  };
  if (token) base.Authorization = `Bearer ${token}`;
  return base;
}

// GET /api/github/repositories — list user repos
githubRoutes.get('/api/github/repositories', async (c) => {
  if (!c.env.GITHUB_TOKEN) {
    return c.json({ error: 'GitHub token not configured' }, 503);
  }

  const res = await fetch('https://api.github.com/user/repos?sort=updated&per_page=10', {
    headers: ghHeaders(c.env),
  });

  if (!res.ok) {
    return c.json({ error: `GitHub API error: ${res.status}` }, 502);
  }

  const data: any[] = await res.json();
  return c.json(data.map((r) => ({
    id: r.id,
    name: r.name,
    fullName: r.full_name,
    description: r.description,
    url: r.html_url,
    stars: r.stargazers_count,
    forks: r.forks_count,
    openIssues: r.open_issues_count,
    lastUpdated: r.updated_at,
  })));
});

// GET /api/github/repositories/:owner/:repo/commits
githubRoutes.get('/api/github/repositories/:owner/:repo/commits', async (c) => {
  if (!c.env.GITHUB_TOKEN) {
    return c.json({ error: 'GitHub token not configured' }, 503);
  }

  const owner = c.req.param('owner');
  const repo = c.req.param('repo');
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=10`, {
    headers: ghHeaders(c.env),
  });

  if (!res.ok) {
    return c.json({ error: `GitHub API error: ${res.status}` }, 502);
  }

  return c.json(await res.json());
});

// GET /api/github/repositories/:owner/:repo/pulls
githubRoutes.get('/api/github/repositories/:owner/:repo/pulls', async (c) => {
  if (!c.env.GITHUB_TOKEN) {
    return c.json({ error: 'GitHub token not configured' }, 503);
  }

  const owner = c.req.param('owner');
  const repo = c.req.param('repo');
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?state=all&per_page=10`, {
    headers: ghHeaders(c.env),
  });

  if (!res.ok) {
    return c.json({ error: `GitHub API error: ${res.status}` }, 502);
  }

  return c.json(await res.json());
});

// GET /api/github/repositories/:owner/:repo/issues
githubRoutes.get('/api/github/repositories/:owner/:repo/issues', async (c) => {
  if (!c.env.GITHUB_TOKEN) {
    return c.json({ error: 'GitHub token not configured' }, 503);
  }

  const owner = c.req.param('owner');
  const repo = c.req.param('repo');
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=10`, {
    headers: ghHeaders(c.env),
  });

  if (!res.ok) {
    return c.json({ error: `GitHub API error: ${res.status}` }, 502);
  }

  return c.json(await res.json());
});

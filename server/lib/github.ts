import { Integration } from '@shared/schema';

interface GitHubRepository {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  url: string;
  stars: number;
  forks: number;
  openIssues: number;
  lastUpdated: Date;
}

interface GitHubCommit {
  id: string;
  message: string;
  author: string;
  date: Date;
  url: string;
}

interface GitHubPullRequest {
  id: number;
  title: 'open' | 'closed' | 'merged';
  state: 'open' | 'closed' | 'merged';
  author: string;
  createdAt: Date;
  updatedAt: Date;
  url: string;
}

interface GitHubIssue {
  id: number;
  title: string;
  state: 'open' | 'closed';
  author: string;
  createdAt: Date;
  updatedAt: Date;
  url: string;
  labels: string[];
}

function getGithubToken(): string | undefined {
  return (
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    process.env.GITHUB_PAT ||
    process.env.GITHUB_SHITTYBOT_TOKEN
  );
}

function githubHeaders(): Record<string, string> {
  const token = getGithubToken();
  const base = { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'ChittyFinance/1.0' };
  return token ? { ...base, 'Authorization': `Bearer ${token}` } : base;
}

/**
 * Fetch user repositories from GitHub
 */
export async function fetchUserRepositories(integration: Integration): Promise<GitHubRepository[]> {
  try {
    if (!getGithubToken()) {
      throw new Error("GitHub token not available");
    }

    const response = await fetch('https://api.github.com/user/repos?sort=updated&per_page=10', {
      headers: githubHeaders(),
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.map((repo: any) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      url: repo.html_url,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      openIssues: repo.open_issues_count,
      lastUpdated: new Date(repo.updated_at),
    }));
  } catch (error) {
    console.error('Error fetching GitHub repositories:', error);
    return [];
  }
}

/**
 * Fetch commits for a specific repository
 */
export async function fetchRepositoryCommits(integration: Integration, repoFullName: string): Promise<GitHubCommit[]> {
  try {
    const token = process.env.GITHUB_SHITTYBOT_TOKEN;
    if (!token) {
      console.error('GitHub token not found in environment variables');
      return [];
    }

    // In a real app, this would make an API call to the GitHub API
    // For demo purposes, return mock data based on the repository name
    const commits: GitHubCommit[] = [
      {
        id: 'a1b2c3d4e5f6',
        message: 'Fix dashboard layout and improve mobile responsiveness',
        author: 'johnsmith',
        date: new Date(Date.now() - 3600000), // 1 hour ago
        url: `https://github.com/${repoFullName}/commit/a1b2c3d4e5f6`,
      },
      {
        id: 'b2c3d4e5f6g7',
        message: 'Add transaction filtering and sorting functionality\n\nThis commit adds the ability to filter transactions by date, amount, and category, as well as sort them in ascending or descending order.',
        author: 'sarahjones',
        date: new Date(Date.now() - 7200000), // 2 hours ago
        url: `https://github.com/${repoFullName}/commit/b2c3d4e5f6g7`,
      },
      {
        id: 'c3d4e5f6g7h8',
        message: 'Integrate OpenAI for financial insights',
        author: 'robertwilson',
        date: new Date(Date.now() - 10800000), // 3 hours ago
        url: `https://github.com/${repoFullName}/commit/c3d4e5f6g7h8`,
      },
      {
        id: 'd4e5f6g7h8i9',
        message: 'Update dependencies and fix security vulnerabilities',
        author: 'amandabrown',
        date: new Date(Date.now() - 14400000), // 4 hours ago
        url: `https://github.com/${repoFullName}/commit/d4e5f6g7h8i9`,
      },
      {
        id: 'e5f6g7h8i9j0',
        message: 'Refactor API endpoints for better performance',
        author: 'michaelgreen',
        date: new Date(Date.now() - 18000000), // 5 hours ago
        url: `https://github.com/${repoFullName}/commit/e5f6g7h8i9j0`,
      }
    ];

    return commits;
  } catch (error) {
    console.error(`Error fetching commits for repository ${repoFullName}:`, error);
    return [];
  }
}

/**
 * Fetch pull requests for a specific repository
 */
export async function fetchRepositoryPullRequests(integration: Integration, repoFullName: string): Promise<GitHubPullRequest[]> {
  try {
    const token = process.env.GITHUB_SHITTYBOT_TOKEN;
    if (!token) {
      console.error('GitHub token not found in environment variables');
      return [];
    }

    // Mock data for demo purposes
    const pullRequests: GitHubPullRequest[] = [
      {
        id: 123,
        title: 'Implement transaction export to CSV/Excel',
        state: 'open',
        author: 'sarahjones',
        createdAt: new Date(Date.now() - 86400000), // 1 day ago
        updatedAt: new Date(Date.now() - 43200000), // 12 hours ago
        url: `https://github.com/${repoFullName}/pull/123`,
      },
      {
        id: 122,
        title: 'Add financial summary charts',
        state: 'merged',
        author: 'johnsmith',
        createdAt: new Date(Date.now() - 172800000), // 2 days ago
        updatedAt: new Date(Date.now() - 86400000), // 1 day ago
        url: `https://github.com/${repoFullName}/pull/122`,
      },
      {
        id: 121,
        title: 'Fix authentication issues',
        state: 'closed',
        author: 'robertwilson',
        createdAt: new Date(Date.now() - 259200000), // 3 days ago
        updatedAt: new Date(Date.now() - 172800000), // 2 days ago
        url: `https://github.com/${repoFullName}/pull/121`,
      }
    ];

    return pullRequests;
  } catch (error) {
    console.error(`Error fetching pull requests for repository ${repoFullName}:`, error);
    return [];
  }
}

/**
 * Fetch issues for a specific repository
 */
export async function fetchRepositoryIssues(integration: Integration, repoFullName: string): Promise<GitHubIssue[]> {
  try {
    const token = process.env.GITHUB_SHITTYBOT_TOKEN;
    if (!token) {
      console.error('GitHub token not found in environment variables');
      return [];
    }

    // Mock data for demo purposes
    const issues: GitHubIssue[] = [
      {
        id: 456,
        title: 'Dashboard loading slowly on mobile devices',
        state: 'open',
        author: 'michaelgreen',
        createdAt: new Date(Date.now() - 86400000), // 1 day ago
        updatedAt: new Date(Date.now() - 43200000), // 12 hours ago
        url: `https://github.com/${repoFullName}/issues/456`,
        labels: ['bug', 'performance', 'mobile'],
      },
      {
        id: 455,
        title: 'Add ability to categorize transactions automatically',
        state: 'open',
        author: 'amandabrown',
        createdAt: new Date(Date.now() - 172800000), // 2 days ago
        updatedAt: new Date(Date.now() - 86400000), // 1 day ago
        url: `https://github.com/${repoFullName}/issues/455`,
        labels: ['enhancement', 'feature-request', 'ai'],
      },
      {
        id: 454,
        title: 'Login page UI improvements',
        state: 'closed',
        author: 'johnsmith',
        createdAt: new Date(Date.now() - 259200000), // 3 days ago
        updatedAt: new Date(Date.now() - 172800000), // 2 days ago
        url: `https://github.com/${repoFullName}/issues/454`,
        labels: ['ui', 'design', 'authentication'],
      }
    ];

    return issues;
  } catch (error) {
    console.error(`Error fetching issues for repository ${repoFullName}:`, error);
    return [];
  }
}
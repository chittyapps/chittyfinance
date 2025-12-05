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
    if (!getGithubToken()) {
      throw new Error("GitHub token not available");
    }

    const response = await fetch(`https://api.github.com/repos/${repoFullName}/commits?per_page=5`, {
      headers: githubHeaders(),
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const commits = await response.json();
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
    if (!getGithubToken()) {
      throw new Error("GitHub token not available");
    }

    const response = await fetch(`https://api.github.com/repos/${repoFullName}/pulls?state=all&per_page=5`, {
      headers: githubHeaders(),
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const pulls = await response.json();
    return pulls;
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
    if (!getGithubToken()) {
      throw new Error("GitHub token not available");
    }

    const response = await fetch(`https://api.github.com/repos/${repoFullName}/issues?state=all&per_page=5`, {
      headers: githubHeaders(),
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const issues = await response.json();
    return issues;
  } catch (error) {
    console.error(`Error fetching issues for repository ${repoFullName}:`, error);
    return [];
  }
}

// Export types
export type { GitHubRepository, GitHubCommit, GitHubPullRequest, GitHubIssue };
import { useQuery } from "@tanstack/react-query";
import { Loader2, GitBranch, Star, GitFork, AlertTriangle, ArrowUpDown } from "lucide-react";
import { formatTimeAgo } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { SiGithub } from "react-icons/si";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  url: string;
  stars: number;
  forks: number;
  openIssues: number;
  lastUpdated: string;
}

interface GitHubCommit {
  id: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

interface GitHubPullRequest {
  id: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  author: string;
  createdAt: string;
  updatedAt: string;
  url: string;
}

interface GitHubIssue {
  id: number;
  title: string;
  state: 'open' | 'closed';
  author: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  labels: string[];
}

export default function GitHubRepositories() {
  const { data: repositories, isLoading: reposLoading } = useQuery<GitHubRepo[]>({
    queryKey: ['/api/github/repositories'],
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  if (reposLoading) {
    return <RepositoriesSkeleton />;
  }

  if (!repositories || repositories.length === 0) {
    return (
      <Card className="mt-6 bg-zinc-900 border-zinc-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SiGithub className="w-5 h-5 text-lime-400" />
              <CardTitle className="text-lg text-zinc-200">GitHub Repositories</CardTitle>
            </div>
          </div>
          <CardDescription className="text-zinc-400">
            Connect to GitHub to track your repositories
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-10">
          <AlertTriangle className="w-10 h-10 text-amber-500 mb-3" />
          <p className="text-zinc-400 text-center mb-4">No GitHub repositories found</p>
          <Button className="bg-lime-500 hover:bg-lime-600 text-black">
            Connect GitHub Account
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-6 bg-zinc-900 border-zinc-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SiGithub className="w-5 h-5 text-lime-400" />
            <CardTitle className="text-lg text-zinc-200">GitHub Repositories</CardTitle>
          </div>
          <Button variant="outline" size="sm" className="h-8 border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100">
            <ArrowUpDown className="mr-2 h-3.5 w-3.5" />
            Sort
          </Button>
        </div>
        <CardDescription className="text-zinc-400">
          Track your codebase and development progress
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {repositories.slice(0, 3).map((repo: GitHubRepo) => (
            <RepoCard key={repo.id} repo={repo} />
          ))}
        </div>
      </CardContent>
      <CardFooter>
        <Button variant="outline" className="w-full border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100">
          View All Repositories
        </Button>
      </CardFooter>
    </Card>
  );
}

function RepoCard({ repo }: { repo: GitHubRepo }) {
  const { data: commits, isLoading: commitsLoading } = useQuery<GitHubCommit[]>({
    queryKey: ['/api/github/repositories', repo.fullName, 'commits'],
    enabled: !!repo.fullName,
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const { data: pullRequests, isLoading: prsLoading } = useQuery<GitHubPullRequest[]>({
    queryKey: ['/api/github/repositories', repo.fullName, 'pulls'],
    enabled: !!repo.fullName,
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const { data: issues, isLoading: issuesLoading } = useQuery<GitHubIssue[]>({
    queryKey: ['/api/github/repositories', repo.fullName, 'issues'],
    enabled: !!repo.fullName,
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return (
    <Card className="bg-zinc-800/50 border-zinc-700 overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <a href={repo.url} target="_blank" rel="noreferrer" className="text-lime-400 hover:underline flex items-center">
            {repo.name}
          </a>
          <div className="flex items-center gap-3 text-xs text-zinc-400">
            <div className="flex items-center gap-1">
              <Star className="w-3.5 h-3.5" /> {repo.stars}
            </div>
            <div className="flex items-center gap-1">
              <GitFork className="w-3.5 h-3.5" /> {repo.forks}
            </div>
            <div className="flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> {repo.openIssues}
            </div>
          </div>
        </CardTitle>
        <CardDescription className="text-xs text-zinc-400 mt-1">
          {repo.description || "No description provided"}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-3 py-0">
        <Tabs defaultValue="commits">
          <TabsList className="grid w-full grid-cols-3 h-9 bg-zinc-900/50">
            <TabsTrigger value="commits" className="text-xs">Commits</TabsTrigger>
            <TabsTrigger value="prs" className="text-xs">Pull Requests</TabsTrigger>
            <TabsTrigger value="issues" className="text-xs">Issues</TabsTrigger>
          </TabsList>
          <TabsContent value="commits" className="mt-2 max-h-56 overflow-y-auto p-1">
            {commitsLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
              </div>
            ) : commits && commits.length > 0 ? (
              <div className="space-y-2">
                {commits && commits.map((commit: GitHubCommit) => {
                  // Safely handle potentially undefined properties
                  const message = commit.message || "";
                  const firstLine = message.includes('\n') ? message.split('\n')[0] : message;
                  return (
                    <a 
                      key={commit.id} 
                      href={commit.url} 
                      target="_blank"
                      rel="noreferrer"
                      className="block p-2 rounded bg-zinc-900/50 hover:bg-zinc-900 transition-colors"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="text-xs font-medium text-zinc-300 truncate">
                          {firstLine}
                        </div>
                        <div className="text-xs text-zinc-500 whitespace-nowrap flex-shrink-0">
                          {formatTimeAgo(new Date(commit.date))}
                        </div>
                      </div>
                      <div className="text-xs text-zinc-500 mt-1 flex items-center gap-1">
                        <GitBranch className="w-3 h-3" /> 
                        {commit.author}
                      </div>
                    </a>
                  );
                })}
              </div>
            ) : (
              <div className="text-center text-zinc-500 py-4 text-xs">No commits found</div>
            )}
          </TabsContent>
          <TabsContent value="prs" className="mt-2 max-h-56 overflow-y-auto p-1">
            {prsLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
              </div>
            ) : pullRequests && pullRequests.length > 0 ? (
              <div className="space-y-2">
                {pullRequests && pullRequests.map((pr: GitHubPullRequest) => (
                  <a 
                    key={pr.id} 
                    href={pr.url} 
                    target="_blank"
                    rel="noreferrer"
                    className="block p-2 rounded bg-zinc-900/50 hover:bg-zinc-900 transition-colors"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="text-xs font-medium text-zinc-300 truncate flex items-center gap-1.5">
                        <Badge className={cn(
                          "px-1.5 text-xs rounded-sm",
                          pr.state === 'open' ? "bg-emerald-900/80 text-emerald-300" : 
                          pr.state === 'merged' ? "bg-purple-900/80 text-purple-300" : 
                          "bg-red-900/80 text-red-300"
                        )}>
                          {pr.state}
                        </Badge>
                        {pr.title}
                      </div>
                      <div className="text-xs text-zinc-500 whitespace-nowrap flex-shrink-0">
                        {formatTimeAgo(new Date(pr.updatedAt))}
                      </div>
                    </div>
                    <div className="text-xs text-zinc-500 mt-1">
                      #{pr.id} by {pr.author}
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <div className="text-center text-zinc-500 py-4 text-xs">No pull requests found</div>
            )}
          </TabsContent>
          <TabsContent value="issues" className="mt-2 max-h-56 overflow-y-auto p-1">
            {issuesLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
              </div>
            ) : issues && issues.length > 0 ? (
              <div className="space-y-2">
                {issues && issues.map((issue: GitHubIssue) => (
                  <a 
                    key={issue.id} 
                    href={issue.url} 
                    target="_blank"
                    rel="noreferrer"
                    className="block p-2 rounded bg-zinc-900/50 hover:bg-zinc-900 transition-colors"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="text-xs font-medium text-zinc-300 truncate flex items-center gap-1.5">
                        <Badge className={cn(
                          "px-1.5 text-xs rounded-sm",
                          issue.state === 'open' ? "bg-emerald-900/80 text-emerald-300" : "bg-red-900/80 text-red-300"
                        )}>
                          {issue.state}
                        </Badge>
                        {issue.title}
                      </div>
                      <div className="text-xs text-zinc-500 whitespace-nowrap flex-shrink-0">
                        {formatTimeAgo(new Date(issue.updatedAt))}
                      </div>
                    </div>
                    <div className="text-xs text-zinc-500 mt-1">
                      #{issue.id} by {issue.author}
                    </div>
                    {issue.labels && issue.labels.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {issue.labels.slice(0, 3).map((label, idx) => (
                          <Badge key={idx} variant="outline" className="px-1 py-0 text-[10px] border-zinc-700 text-zinc-400">
                            {label}
                          </Badge>
                        ))}
                        {issue.labels.length > 3 && (
                          <Badge variant="outline" className="px-1 py-0 text-[10px] border-zinc-700 text-zinc-400">
                            +{issue.labels.length - 3} more
                          </Badge>
                        )}
                      </div>
                    )}
                  </a>
                ))}
              </div>
            ) : (
              <div className="text-center text-zinc-500 py-4 text-xs">No issues found</div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="px-3 py-2 text-xs text-zinc-500">
        Last updated {formatTimeAgo(new Date(repo.lastUpdated))}
      </CardFooter>
    </Card>
  );
}

function RepositoriesSkeleton() {
  return (
    <Card className="mt-6 bg-zinc-900 border-zinc-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SiGithub className="w-5 h-5 text-lime-400" />
            <CardTitle className="text-lg text-zinc-200">GitHub Repositories</CardTitle>
          </div>
        </div>
        <CardDescription className="text-zinc-400">
          Track your codebase and development progress
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="bg-zinc-800/50 border-zinc-700 overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="h-5 bg-zinc-700 rounded w-1/3 animate-pulse"></div>
                  <div className="flex items-center gap-3">
                    <div className="h-4 bg-zinc-700 rounded w-12 animate-pulse"></div>
                    <div className="h-4 bg-zinc-700 rounded w-12 animate-pulse"></div>
                  </div>
                </div>
                <div className="h-4 bg-zinc-700 rounded w-2/3 mt-2 animate-pulse"></div>
              </CardHeader>
              <CardContent className="px-3 py-2">
                <div className="h-8 bg-zinc-700 rounded w-full mb-2 animate-pulse"></div>
                <div className="space-y-2 mt-4">
                  <div className="h-12 bg-zinc-700 rounded w-full animate-pulse"></div>
                  <div className="h-12 bg-zinc-700 rounded w-full animate-pulse"></div>
                  <div className="h-12 bg-zinc-700 rounded w-full animate-pulse"></div>
                </div>
              </CardContent>
              <CardFooter className="px-3 py-2">
                <div className="h-4 bg-zinc-700 rounded w-1/3 animate-pulse"></div>
              </CardFooter>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
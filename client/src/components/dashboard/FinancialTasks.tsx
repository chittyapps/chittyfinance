import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Task } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { getPriorityClass, getLabelForPriority } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export default function FinancialTasks() {
  const { data: tasks, isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks", { limit: 3 }],
  });

  return (
    <Card className="overflow-hidden">
      <CardHeader className="px-6 py-5 border-b border-gray-200 dark:border-gray-700">
        <CardTitle className="text-lg font-medium">Financial Tasks</CardTitle>
      </CardHeader>
      
      <CardContent className="px-6 py-5">
        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
          {isLoading ? (
            // Skeleton loading state
            <>
              <TaskItemSkeleton />
              <TaskItemSkeleton />
              <TaskItemSkeleton />
            </>
          ) : tasks && tasks.length > 0 ? (
            // Map over tasks
            tasks.map((task) => (
              <TaskItem 
                key={task.id} 
                task={task} 
              />
            ))
          ) : (
            // Empty state
            <li className="py-4 text-center text-gray-500 dark:text-gray-400">
              No tasks found
            </li>
          )}
        </ul>
        
        <div className="mt-6">
          <Button 
            variant="outline" 
            className="w-full border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
          >
            View All Tasks
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface TaskItemProps {
  task: Task;
}

function TaskItem({ task }: TaskItemProps) {
  const queryClient = useQueryClient();
  
  const toggleTaskMutation = useMutation({
    mutationFn: async (taskId: number) => {
      const res = await apiRequest("PATCH", `/api/tasks/${taskId}`, {
        completed: !task.completed
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    }
  });

  const handleToggleTask = () => {
    toggleTaskMutation.mutate(task.id);
  };

  const priorityClass = getPriorityClass(task.priority);
  const priorityLabel = getLabelForPriority(task.priority);

  return (
    <li className={`py-4 ${task.completed ? 'opacity-60' : ''}`}>
      <div className="flex items-start">
        <div className="flex-shrink-0 pt-1">
          <Checkbox 
            checked={task.completed} 
            onCheckedChange={handleToggleTask}
            disabled={toggleTaskMutation.isPending}
          />
        </div>
        <div className="ml-3 flex-1">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {task.title}
            </p>
            <div className="ml-2 flex-shrink-0 flex">
              <Badge variant="outline" className={priorityClass}>
                {priorityLabel}
              </Badge>
            </div>
          </div>
          <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            <p>{task.description}</p>
          </div>
        </div>
      </div>
    </li>
  );
}

function TaskItemSkeleton() {
  return (
    <li className="py-4">
      <div className="flex items-start">
        <div className="flex-shrink-0 pt-1">
          <Skeleton className="h-4 w-4 rounded" />
        </div>
        <div className="ml-3 flex-1">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-3/4 mb-2" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    </li>
  );
}

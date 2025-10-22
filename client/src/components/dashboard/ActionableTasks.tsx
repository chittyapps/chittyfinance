import { useState } from "react";
import { CheckCircle2, Circle, Calendar, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Task {
  id: string;
  title: string;
  description: string;
  dueDate: Date;
  priority: "urgent" | "high" | "normal";
  completed: boolean;
}

export default function ActionableTasks() {
  const [tasks, setTasks] = useState<Task[]>([
    {
      id: "1",
      title: "Review Downtown Lofts maintenance request",
      description: "HVAC system needs inspection",
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      priority: "urgent",
      completed: false
    },
    {
      id: "2",
      title: "Process rent payments for Sunset Apartments",
      description: "15 units pending",
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      priority: "high",
      completed: false
    },
    {
      id: "3",
      title: "Schedule property inspection for Riverside",
      description: "Annual inspection due",
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      priority: "normal",
      completed: false
    }
  ]);

  const toggleTask = (taskId: string) => {
    setTasks(tasks.map(task =>
      task.id === taskId ? { ...task, completed: !task.completed } : task
    ));
  };

  const getPriorityColor = (priority: Task["priority"]) => {
    switch (priority) {
      case "urgent":
        return "text-destructive";
      case "high":
        return "text-accent";
      case "normal":
        return "text-muted-foreground";
    }
  };

  const formatDueDate = (date: Date) => {
    const days = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days === 0) return "Today";
    if (days === 1) return "Tomorrow";
    if (days < 7) return `${days} days`;
    return date.toLocaleDateString();
  };

  return (
    <div className="apple-card p-6 fade-slide-in" data-testid="card-actionable-tasks">
      <div className="mb-6">
        <h3 className="text-xl font-semibold mb-1">Action Items</h3>
        <p className="text-sm text-muted-foreground">
          {tasks.filter(t => !t.completed).length} tasks need your attention
        </p>
      </div>

      <div className="space-y-3">
        {tasks.map((task) => (
          <div
            key={task.id}
            className={cn(
              "group p-4 rounded-xl border transition-all duration-200 cursor-pointer",
              task.completed
                ? "bg-muted/30 border-border/50 opacity-60"
                : "bg-card border-border hover:border-primary/50"
            )}
            onClick={() => toggleTask(task.id)}
            data-testid={`task-${task.id}`}
          >
            <div className="flex items-start gap-3">
              <div className="pt-0.5">
                {task.completed ? (
                  <CheckCircle2 className="w-5 h-5 text-primary" data-testid={`checkbox-${task.id}-checked`} />
                ) : (
                  <Circle className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" data-testid={`checkbox-${task.id}`} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h4
                    className={cn(
                      "font-medium text-sm",
                      task.completed && "line-through"
                    )}
                    data-testid={`text-task-title-${task.id}`}
                  >
                    {task.title}
                  </h4>
                  <span className={cn("text-xs font-medium flex-shrink-0", getPriorityColor(task.priority))}>
                    {task.priority}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  {task.description}
                </p>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="w-3 h-3" />
                  <span data-testid={`text-task-due-${task.id}`}>{formatDueDate(task.dueDate)}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {tasks.every(t => t.completed) && (
        <div className="mt-6 text-center p-8 celebrate">
          <div className="w-16 h-16 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-primary" />
          </div>
          <h4 className="font-semibold mb-1">All caught up!</h4>
          <p className="text-sm text-muted-foreground">
            You've completed all your tasks
          </p>
        </div>
      )}
    </div>
  );
}

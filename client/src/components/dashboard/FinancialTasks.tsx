import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Task } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { getPriorityClass, getLabelForPriority } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { Sparkles, CheckCircle2 } from "lucide-react";
import { useState } from "react";

export default function FinancialTasks() {
  const { data: tasks, isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks", { limit: 3 }],
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 100, damping: 15 }}
    >
      <Card className="overflow-hidden hover:shadow-lg transition-shadow duration-300">
        <CardHeader className="px-6 py-5 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Your Tasks
            </CardTitle>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
              {tasks?.filter(t => !t.completed).length || 0} pending
            </Badge>
          </div>
        </CardHeader>
        
        <CardContent className="px-6 py-5">
          <AnimatePresence mode="popLayout">
            <motion.ul 
              className="divide-y divide-gray-200 dark:divide-gray-700"
              layout
            >
              {isLoading ? (
                <>
                  <TaskItemSkeleton />
                  <TaskItemSkeleton />
                  <TaskItemSkeleton />
                </>
              ) : tasks && tasks.length > 0 ? (
                tasks.map((task, index) => (
                  <TaskItem 
                    key={task.id} 
                    task={task}
                    index={index}
                  />
                ))
              ) : (
                <motion.li
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="py-8 text-center text-gray-500 dark:text-gray-400"
                >
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-green-500 opacity-50" />
                  <p className="font-medium">All caught up!</p>
                  <p className="text-sm mt-1">No pending tasks</p>
                </motion.li>
              )}
            </motion.ul>
          </AnimatePresence>
          
          <motion.div 
            className="mt-6"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Button 
              variant="outline" 
              className="w-full border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-all duration-200"
              data-testid="button-view-all-tasks"
            >
              View All Tasks
            </Button>
          </motion.div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

interface TaskItemProps {
  task: Task;
  index: number;
}

function TaskItem({ task, index }: TaskItemProps) {
  const queryClient = useQueryClient();
  const [isCompleting, setIsCompleting] = useState(false);
  
  const toggleTaskMutation = useMutation({
    mutationFn: async (taskId: number) => {
      const res = await apiRequest("PATCH", `/api/tasks/${taskId}`, {
        completed: !task.completed
      });
      return res.json();
    },
    onSuccess: (_, taskId) => {
      // Celebrate task completion with confetti!
      if (!task.completed) {
        setIsCompleting(true);
        celebrateTaskCompletion();
        
        // Reset animation state after celebration
        setTimeout(() => {
          setIsCompleting(false);
          queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
        }, 800);
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      }
    }
  });

  const handleToggleTask = () => {
    toggleTaskMutation.mutate(task.id);
  };

  const celebrateTaskCompletion = () => {
    // Confetti burst from checkbox position
    const count = 50;
    const defaults = {
      origin: { y: 0.7 },
      zIndex: 9999,
    };

    function fire(particleRatio: number, opts: any) {
      confetti({
        ...defaults,
        ...opts,
        particleCount: Math.floor(count * particleRatio),
      });
    }

    // Multiple bursts for extra delight
    fire(0.25, {
      spread: 26,
      startVelocity: 55,
    });

    fire(0.2, {
      spread: 60,
    });

    fire(0.35, {
      spread: 100,
      decay: 0.91,
      scalar: 0.8,
    });

    fire(0.1, {
      spread: 120,
      startVelocity: 25,
      decay: 0.92,
      scalar: 1.2,
    });

    fire(0.1, {
      spread: 120,
      startVelocity: 45,
    });
  };

  const priorityClass = getPriorityClass(task.priority);
  const priorityLabel = getLabelForPriority(task.priority);

  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ 
        opacity: task.completed ? 0.5 : 1, 
        x: 0,
        scale: isCompleting ? 1.05 : 1
      }}
      exit={{ opacity: 0, x: 20, transition: { duration: 0.2 } }}
      transition={{ 
        type: "spring", 
        stiffness: 300, 
        damping: 25,
        delay: index * 0.1 
      }}
      className={`py-4 relative ${task.completed ? 'line-through' : ''}`}
      whileHover={{ 
        x: 4,
        transition: { type: "spring", stiffness: 400, damping: 10 }
      }}
      data-testid={`task-item-${task.id}`}
    >
      {isCompleting && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          className="absolute inset-0 bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-lg -mx-2 pointer-events-none"
        />
      )}
      
      <div className="flex items-start relative z-10">
        <motion.div 
          className="flex-shrink-0 pt-1"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          <Checkbox 
            checked={task.completed ?? false}
            onCheckedChange={handleToggleTask}
            disabled={toggleTaskMutation.isPending}
            data-testid={`checkbox-task-${task.id}`}
          />
        </motion.div>
        
        <div className="ml-3 flex-1">
          <div className="flex items-center justify-between">
            <motion.p 
              className={`text-sm font-medium text-gray-900 dark:text-white ${
                task.completed ? 'line-through opacity-60' : ''
              }`}
              layout
            >
              {task.title}
            </motion.p>
            <motion.div 
              className="ml-2 flex-shrink-0 flex"
              whileHover={{ scale: 1.05 }}
              transition={{ type: "spring", stiffness: 400, damping: 10 }}
            >
              <Badge variant="outline" className={priorityClass}>
                {priorityLabel}
              </Badge>
            </motion.div>
          </div>
          <motion.div 
            className="mt-1 text-sm text-gray-500 dark:text-gray-400"
            layout
          >
            <p className={task.completed ? 'opacity-60' : ''}>{task.description}</p>
          </motion.div>
        </div>
      </div>
    </motion.li>
  );
}

function TaskItemSkeleton() {
  return (
    <motion.li 
      className="py-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
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
    </motion.li>
  );
}

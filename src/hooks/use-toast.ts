
import { createContext, useContext, useState } from 'react';
import { toast as sonnerToast } from 'sonner';

// Define types for our toast
export type ToastProps = {
  id: string;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  variant?: 'default' | 'destructive';
};

// Context for providing toast functionality
type ToastContextType = {
  toasts: ToastProps[];
  addToast: (props: Omit<ToastProps, 'id'>) => string;
  removeToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextType | null>(null);

// Toast provider component
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastProps[]>([]);

  const addToast = (props: Omit<ToastProps, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prevToasts) => [...prevToasts, { id, ...props }]);
    return id;
  };

  const removeToast = (id: string) => {
    setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== id));
  };

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  );
}

// Hook for using toast
export function useToast() {
  const context = useContext(ToastContext);
  
  if (!context) {
    // If we're running in Chrome extension context, create a basic implementation
    return {
      toasts: [],
      addToast: () => '',
      removeToast: () => {},
      toast: (props: any) => {
        sonnerToast(props.title, {
          description: props.description,
        });
      }
    };
  }
  
  return {
    ...context,
    toast: (props: Omit<ToastProps, 'id'>) => {
      context.addToast(props);
    },
  };
}

// Simple function to show toasts without using the hook
export const toast = ({
  title,
  description,
  variant = 'default',
}: Omit<ToastProps, 'id'>) => {
  // Use sonner toast as fallback when in extension context
  sonnerToast(title || '', {
    description: description,
    className: variant === 'destructive' ? 'bg-destructive text-destructive-foreground' : '',
  });
};

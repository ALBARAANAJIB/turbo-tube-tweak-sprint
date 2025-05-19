
import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { AnimatePresence, motion } from "framer-motion"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      <AnimatePresence mode="sync">
        {toasts.map(function ({ id, title, description, action, ...props }) {
          return (
            <motion.div
              key={id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ 
                duration: 0.4,
                ease: "easeOut"
              }}
              className="relative z-50"
            >
              <Toast key={id} {...props}>
                <div className="grid gap-1">
                  {title && <ToastTitle className="text-base">{title}</ToastTitle>}
                  {description && (
                    <ToastDescription className="text-sm">{description}</ToastDescription>
                  )}
                </div>
                {action}
                <ToastClose />
              </Toast>
            </motion.div>
          )
        })}
      </AnimatePresence>
      <ToastViewport className="fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:right-0 sm:top-auto sm:bottom-0 sm:flex-col md:max-w-[420px]" />
    </ToastProvider>
  )
}

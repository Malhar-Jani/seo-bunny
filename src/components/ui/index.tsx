import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { Loader2 } from 'lucide-react';

// ============= BUTTON =============
const buttonVariants = cva(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
    {
        variants: {
            variant: {
                default: 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm',
                secondary: 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 hover:text-gray-900 shadow-sm',
                outline: 'border border-gray-300 bg-transparent text-gray-700 hover:bg-gray-50',
                ghost: 'text-gray-600 hover:text-gray-900 hover:bg-gray-100',
                destructive: 'bg-red-600 text-white hover:bg-red-700',
                link: 'text-blue-600 underline-offset-4 hover:underline',
            },
            size: {
                default: 'h-10 px-4 py-2',
                sm: 'h-9 px-3 text-xs',
                lg: 'h-11 px-8 text-base',
                icon: 'h-10 w-10',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    }
);

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    asChild?: boolean;
    isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, isLoading = false, children, ...props }, ref) => {
        const Comp = asChild ? Slot : 'button';
        return (
            <Comp
                className={buttonVariants({ variant, size, className })}
                ref={ref}
                disabled={isLoading || props.disabled}
                {...props}
            >
                {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {children}
            </Comp>
        );
    }
);
Button.displayName = 'Button';

// ============= CARD =============
export function Card({
    children,
    className = '',
    noPadding = false,
}: {
    children: React.ReactNode;
    className?: string;
    noPadding?: boolean;
}) {
    return (
        <div className={`bg-white border border-gray-200 rounded-xl card-shadow ${className}`}>
            {noPadding ? children : <div className="p-6">{children}</div>}
        </div>
    );
}

// ============= BADGE =============
const badgeVariants = cva(
    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
    {
        variants: {
            variant: {
                default: 'bg-gray-100 text-gray-600 border border-gray-200',
                success: 'bg-green-50 text-green-700 border border-green-200',
                warning: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
                destructive: 'bg-red-50 text-red-700 border border-red-200',
                blue: 'bg-blue-50 text-blue-700 border border-blue-200',
                outline: 'bg-transparent text-gray-400 border border-gray-200',
            },
        },
        defaultVariants: {
            variant: 'default',
        },
    }
);

export function Badge({ children, variant, className }: { children: React.ReactNode, variant?: VariantProps<typeof badgeVariants>['variant'], className?: string }) {
    return (
        <span className={badgeVariants({ variant, className })}>
            {children}
        </span>
    );
}

// ============= INPUT =============
export const Input = forwardRef<
    HTMLInputElement,
    React.InputHTMLAttributes<HTMLInputElement> & { icon?: React.ReactNode }
>(({ className, icon, ...props }, ref) => {
    return (
        <div className="relative">
            {icon && (
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {icon}
                </div>
            )}
            <input
                className={`
          flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 
          file:border-0 file:bg-transparent file:text-sm file:font-medium 
          placeholder:text-gray-400 
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
          disabled:cursor-not-allowed disabled:opacity-50
          transition-all duration-200
          ${icon ? 'pl-10' : ''}
          ${className}
        `}
                ref={ref}
                {...props}
            />
        </div>
    );
});
Input.displayName = 'Input';

// ============= SELECT =============
export const Select = forwardRef<
    HTMLSelectElement,
    React.SelectHTMLAttributes<HTMLSelectElement> & { icon?: React.ReactNode }
>(({ className, icon, children, ...props }, ref) => {
    return (
        <div className="relative">
            {icon && (
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10">
                    {icon}
                </div>
            )}
            <select
                className={`
          flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
          disabled:cursor-not-allowed disabled:opacity-50
          appearance-none cursor-pointer
          ${icon ? 'pl-10' : ''}
          ${className}
        `}
                ref={ref}
                {...props}
            >
                {children}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </div>
        </div>
    );
});
Select.displayName = 'Select';

// ============= PROGRESS =============
export function Progress({
    value,
    max = 100,
    size = 'default',
    color = 'blue'
}: {
    value: number;
    max?: number;
    size?: 'sm' | 'default';
    color?: 'green' | 'blue' | 'yellow' | 'red';
}) {
    const percentage = Math.round((value / max) * 100);
    const h = size === 'sm' ? 'h-1.5' : 'h-2.5';
    const bg = {
        green: 'bg-green-500',
        blue: 'bg-blue-600',
        yellow: 'bg-yellow-500',
        red: 'bg-red-500',
    }[color];

    return (
        <div className={`w-full bg-gray-100 rounded-full overflow-hidden ${h}`}>
            <div
                className={`${h} ${bg} rounded-full transition-all duration-500 ease-out`}
                style={{ width: `${percentage}%` }}
            />
        </div>
    );
}

// ============= SKELETON =============
export function Skeleton({ className }: { className?: string }) {
    return (
        <div className={`animate-pulse bg-gray-200 rounded-md ${className}`} />
    );
}

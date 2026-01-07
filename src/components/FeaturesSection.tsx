import { useEffect, useRef, useState } from 'react';
import { LayoutDashboard, PieChart, TrendingUp, LineChart, Wallet, Heart, Import, ShieldCheck } from 'lucide-react';
import { cn } from '../lib/utils';

const FEATURES = [
    {
        icon: <LayoutDashboard className="w-5 h-5" />,
        title: "Smart Overview",
        description: "Get an instant snapshot of your net balance and recent financial activity at a glance.",
        color: "bg-emerald-50 text-emerald-600"
    },
    {
        icon: <PieChart className="w-5 h-5" />,
        title: "Category Insights",
        description: "Deep dive into your spending habits with detailed category and tag breakdowns.",
        color: "bg-blue-50 text-blue-600"
    },
    {
        icon: <TrendingUp className="w-5 h-5" />,
        title: "Income Analysis",
        description: "Track your revenue sources and monitor your monthly earnings growth.",
        color: "bg-purple-50 text-purple-600"
    },
    {
        icon: <LineChart className="w-5 h-5" />,
        title: "Financial Trends",
        description: "Analyze historical performance over 3M, 6M, 1Y or All Time periods.",
        color: "bg-amber-50 text-amber-600"
    },
    {
        icon: <Wallet className="w-5 h-5" />,
        title: "Multi-Wallet",
        description: "Manage multiple accounts and track your total net worth in one place.",
        color: "bg-indigo-50 text-indigo-600"
    },
    {
        icon: <Heart className="w-5 h-5" />,
        title: "Goal Planning",
        description: "Set financial goals, track wishlists, and monitor your savings progress.",
        color: "bg-rose-50 text-rose-600"
    },
    {
        icon: <Import className="w-5 h-5" />,
        title: "AI Integration",
        description: "Export clean data efficiently for advanced analysis with ChatGPT or Gemini.",
        color: "bg-sky-50 text-sky-600"
    },
    {
        icon: <ShieldCheck className="w-5 h-5" />,
        title: "Privacy First",
        description: "100% local processing. Your financial data is never uploaded to any server.",
        color: "bg-gray-50 text-gray-600"
    }
];

export const FeaturesSection = () => {
    const sectionRef = useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.disconnect(); // Only animate once
                }
            },
            { threshold: 0.1 }
        );

        if (sectionRef.current) {
            observer.observe(sectionRef.current);
        }

        return () => observer.disconnect();
    }, []);

    return (
        <div ref={sectionRef} className="mt-32 w-full pb-20">
            <div className={cn(
                "text-center mb-16 transition-all duration-1000 transform",
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
            )}>
                <h3 className="text-sm font-bold text-emerald-600 uppercase tracking-[0.2em] mb-4">
                    System Capabilities
                </h3>
                <h2 className="text-3xl md:text-4xl font-bold text-emerald-950 tracking-tight">
                    Everything you need to <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-500">
                        Master Your Money
                    </span>
                </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full px-4">
                {FEATURES.map((feature, idx) => (
                    <div
                        key={idx}
                        className={cn(
                            "group relative overflow-hidden rounded-2xl p-6 transition-all duration-700",
                            // "Ceramic" Glass Style: High opacity for readability
                            "bg-white/80 backdrop-blur-xl border border-white/60 shadow-sm",
                            "hover:shadow-[0_20px_40px_-15px_rgba(16,185,129,0.15)] hover:-translate-y-2 hover:bg-white/95 hover:border-emerald-100",
                            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-20"
                        )}
                        style={{ transitionDelay: `${idx * 100}ms` }}
                    >
                        {/* Soft Gradient Overlay on Hover */}
                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                        <div className={cn(
                            "w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3",
                            "bg-white shadow-sm text-emerald-600 border border-emerald-50"
                        )}>
                            {feature.icon}
                        </div>

                        <div className="relative z-10 space-y-2">
                            <h3 className="font-bold text-lg text-emerald-950 group-hover:text-emerald-700 transition-colors">
                                {feature.title}
                            </h3>
                            <p className="text-sm text-slate-600 leading-relaxed font-medium group-hover:text-slate-900 transition-colors">
                                {feature.description}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

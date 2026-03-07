export const landingPageConfig = {
    colors: {
        background: '#f4f2f0ff',
        text: '#034638',
        primary: '#034638',
        primaryText: '#f7f0e8',
        accentLight: 'rgba(3, 70, 56, 0.05)', // #034638 with 5% opacity
        accentBorder: 'rgba(3, 70, 56, 0.1)', // #034638 with 10% opacity
    },
    hero: {
        title: "Personal Finance Tracking\nAutomated With Finsight.",
        subtitle: "Stop wrestling with messy speadsheets. FinSight uses AI to clean, categorize, and analyze your spending automatically, so you don't have to.",
        // Adjust these to tweak the positioning of the right-side images
        baseImageStyles: "top-10 right-0 w-4/5 transform translate-x-4 translate-y-8 rotate-3",
        overlapImageStyles: "top-[350px] left-0 w-3/4 transform -translate-x-8 -rotate-2",
    },
    featuresSection: {
        title: "Everything You Need to Understand Your Spending",
        subtitle: "Built for people who want a fast, flexible way to organize transactions and uncover meaningful insights from their financial data.",
    },
    features: [
        {
            title: "Process Transactions Automatically",
            description: "Transactions are cleaned and categorized using customizable natural-language rules and custom categories.",
            image: "/feature-screenshots/process-sc.png"
        },
        {
            title: "Edit and Adjust Transactions Easily",
            description: "Quickly edit transactions and reconcile transfers so shared expenses reflect true spending",
            image: "/feature-screenshots/edit-sc.png"
        },
        {
            title: "Understand Your Spending Trends",
            description: "Track how your spending evolves over time with clear visualizations that surface patterns and changes in your habits.",
            image: "/feature-screenshots/trends-sc.png"
        },
        {
            title: "See Where Your Money Goes",
            description: "See exactly where your money goes with clean category summaries and breakdowns.",
            image: "/feature-screenshots/breakdown-sc.png"
        }
    ]
};

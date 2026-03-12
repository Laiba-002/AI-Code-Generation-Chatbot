import React from "react";
//1
import {
  Code,
  Database,
  Globe,
  Layers,
  Smartphone,
  Terminal,
} from "lucide-react";
import { User } from "../services/authService";

interface WelcomeScreenProps {
  onStartChat: () => void;
  currentUser: User | null;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onStartChat,
  currentUser,
}) => {
  const taskOptions = [
    {
      icon: <Globe className="w-5 h-5" />,
      title: "Full-Stack Apps",
      description: "Complete MERN, MEAN, Django+React projects",
      color:
        "bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20",
    },

    {
      icon: <Database className="w-5 h-5" />,
      title: "APIs & Backend",
      description: "REST APIs, GraphQL, microservices",
      color:
        "bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20",
    },

    {
      icon: <Smartphone className="w-5 h-5" />,
      title: "Frontend & Mobile",
      description: "React, Vue, Angular, React Native apps",
      color:
        "bg-purple-500/10 text-purple-400 border-purple-500/20 hover:bg-purple-500/20",
    },

    {
      icon: <Terminal className="w-5 h-5" />,
      title: "DevOps & Tools",
      description: "Docker, CI/CD, deployment scripts",
      color:
        "bg-orange-500/10 text-orange-400 border-orange-500/20 hover:bg-orange-500/20",
    },

    {
      icon: <Code className="w-5 h-5" />,
      title: "Debug & Refactor",
      description: "Fix bugs, optimize code, add features",
      color: "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20",
    },
    {
      icon: <Layers className="w-5 h-5" />,
      title: "Architecture",
      description: "System design, patterns, scalability",
      color:
        "bg-cyan-500/10 text-cyan-400 border-cyan-500/20 hover:bg-cyan-500/20",
    },
  ];

  // Get user's first name for greeting
  const getUserFirstName = () => {
    if (!currentUser) return "User";
    return currentUser.username.split(" ")[0] || currentUser.username;
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 max-w-4xl mx-auto space-y-3 ">
      {/* Personalized Welcome Header */}
      <div className="text-center mb-4 ">
        <div className="flex flex-wrap items-center justify-center mb-2 space-y-3 ">
          <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center mr-3">
            {/* //7 */}
            <Code className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white">CodeGenius AI</h1>
        </div>

        <p className="text-gray-400 text-md mb-1 space-y-3 ">
          Welcome back, {getUserFirstName()}! Ready to build something amazing?
        </p>
        <p className="text-gray-500 text-sm">
          Your expert full-stack development companion
        </p>
      </div>

      {/* Task Options Grid */}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4 mb-8 w-full px-4 ">
        {taskOptions.map((task, index) => (
          <button
            key={index}
            onClick={onStartChat}
            className={`p-8 rounded-xl border ${task.color} hover:scale-105 transition-all duration-200 text-left flex space-x-4  items-center justify-center `}
          >
            <div className="mb-2">{task.icon}</div>
            <h3 className="font-semibold text-lg mb-1">{task.title}</h3>
            {/* <p className="text-sm opacity-80">{task.description}</p> */}
          </button>
        ))}
      </div>

      {/* Quick Start Hint */}
      {/* <div className="text-center space-y-3  ">
       
        <p className="text-sm text-gray-500 mb-1">
          Start coding with a simple request like:
        </p>
      
        <div className="text-xs text-gray-600 space-y-2">
          <p>"Create a React todo app with TypeScript", "Build a REST API with Node.js and MongoDB", "Help me debug this JavaScript function"</p>
        </div>
      </div> */}
    </div>
  );
};

export default WelcomeScreen;

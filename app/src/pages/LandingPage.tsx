import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Shield, 
  Users, 
  Bed, 
  Bus, 
  UserCheck, 
  Lock, 
  Globe, 
  FileCheck,
  ArrowRight,
  Menu,
  X
} from 'lucide-react';
import { useState } from 'react';

export default function LandingPage() {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const features = [
    {
      icon: FileCheck,
      title: 'Smart Registration',
      description: 'Streamlined guest registration with document upload, visa tracking, and automated reference generation.',
    },
    {
      icon: Bed,
      title: 'Room Management',
      description: 'Real-time occupancy tracking with capacity alerts and family grouping for seamless accommodation.',
    },
    {
      icon: Bus,
      title: 'Transport Coordination',
      description: 'Flight monitoring, pickup scheduling, and handoff management between transport and accommodation teams.',
    },
    {
      icon: UserCheck,
      title: 'Role-Based Access',
      description: 'Six-tier permission system ensuring data security and appropriate access for every team member.',
    },
    {
      icon: Lock,
      title: 'Privacy Protection',
      description: 'GDPR-compliant data handling with automatic PII masking for lower-tier access levels.',
    },
    {
      icon: Globe,
      title: 'Multi-Country Support',
      description: 'Dedicated country desks with assigned coordinators for localized guest management.',
    },
  ];

  const stats = [
    { value: '90+', label: 'Countries' },
    { value: '12,000+', label: 'Expected Guests' },
    { value: '8', label: 'Departments' },
    { value: '4', label: 'Locations' },
  ];

  const steps = [
    {
      number: '1',
      title: 'Submit',
      description: 'Country coordinators submit guest details through the secure portal.',
    },
    {
      number: '2',
      title: 'Verify',
      description: 'Desk In-Charges review and verify all submitted information.',
    },
    {
      number: '3',
      title: 'Assign',
      description: 'Guests are assigned to departments and accommodation locations.',
    },
  ];

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      {/* Navigation */}
      <nav className="bg-white border-b border-[#E8E3DB]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#2D5A45] rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">M</span>
              </div>
              <span className="text-xl font-semibold text-[#1A1A1A]">Project Mehmaan</span>
            </div>

            <div className="hidden md:flex items-center gap-4">
              <Button
                variant="ghost"
                onClick={() => navigate('/login')}
                className="text-[#4A4A4A] hover:text-[#1A1A1A]"
              >
                Sign in
              </Button>
              <Button
                onClick={() => navigate('/login')}
                className="bg-[#2D5A45] hover:bg-[#234839] text-white"
              >
                Get Started
              </Button>
            </div>

            <button
              className="md:hidden p-2"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-[#E8E3DB] px-4 py-4">
            <Button
              variant="ghost"
              onClick={() => navigate('/login')}
              className="w-full justify-start text-[#4A4A4A]"
            >
              Sign in
            </Button>
            <Button
              onClick={() => navigate('/login')}
              className="w-full mt-2 bg-[#2D5A45] hover:bg-[#234839] text-white"
            >
              Get Started
            </Button>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="py-16 md:py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#E8F5EE] rounded-full text-[#2D5A45] text-sm font-medium mb-6">
                <Shield className="w-4 h-4" />
                Jalsa Salana UK 2024
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#1A1A1A] leading-tight mb-6">
                Welcome guests with{' '}
                <span className="text-[#2D5A45]">clarity and calm</span>
              </h1>
              <p className="text-lg text-[#4A4A4A] mb-8 max-w-lg">
                A single system for registration, accommodation, and transport—designed for hosts, 
                coordinators, and on-ground teams managing thousands of international guests.
              </p>
              <div className="flex flex-wrap gap-4">
                <Button
                  onClick={() => navigate('/login')}
                  className="bg-[#2D5A45] hover:bg-[#234839] text-white px-6"
                >
                  Enter the System
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate('/login')}
                  className="border-[#2D5A45] text-[#2D5A45] hover:bg-[#E8F5EE]"
                >
                  <Users className="w-4 h-4 mr-2" />
                  Coordinator Portal
                </Button>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-xl p-8">
              <div className="grid grid-cols-2 gap-6">
                {stats.map((stat, index) => (
                  <div key={index} className="text-center p-4 bg-[#F5F0E8] rounded-xl">
                    <div className="text-3xl md:text-4xl font-bold text-[#2D5A45]">{stat.value}</div>
                    <div className="text-sm text-[#4A4A4A] mt-1">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-[#1A1A1A] mb-4">
              Everything you need
            </h2>
            <p className="text-lg text-[#4A4A4A] max-w-2xl mx-auto">
              A comprehensive platform that handles every aspect of guest management from registration to departure.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <Card key={index} className="border-[#E8E3DB] hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="w-12 h-12 bg-[#2D5A45] rounded-lg flex items-center justify-center mb-4">
                    <feature.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-[#1A1A1A] mb-2">{feature.title}</h3>
                  <p className="text-[#4A4A4A]">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-16 bg-[#F5F0E8]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold text-[#1A1A1A] mb-12 text-center">
            How it works
          </h2>
          <p className="text-lg text-[#4A4A4A] text-center mb-12 max-w-2xl mx-auto">
            A clear, step-by-step process that ensures every guest is properly registered, reviewed, and accommodated.
          </p>

          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, index) => (
              <div key={index} className="relative">
                <div className="bg-white rounded-xl p-8 shadow-md">
                  <div className="w-12 h-12 bg-[#2D5A45] rounded-full flex items-center justify-center text-white font-bold text-xl mb-4">
                    {step.number}
                  </div>
                  <h3 className="text-xl font-semibold text-[#1A1A1A] mb-2">{step.title}</h3>
                  <p className="text-[#4A4A4A]">{step.description}</p>
                </div>
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-1/2 -right-4 transform -translate-y-1/2 z-10">
                    <ArrowRight className="w-8 h-8 text-[#2D5A45]" />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-12 flex flex-wrap justify-center gap-4">
            {[
              'Automated reference number generation',
              'Real-time status tracking',
              'Capacity alerts and warnings',
              'Complete audit trail',
              'Mobile-friendly interface',
            ].map((item, index) => (
              <div key={index} className="flex items-center gap-2 px-4 py-2 bg-white rounded-full text-sm text-[#4A4A4A]">
                <div className="w-2 h-2 bg-[#2D5A45] rounded-full" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Banner */}
      <section className="py-12 bg-[#2D5A45]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {stats.map((stat, index) => (
              <div key={index}>
                <div className="text-3xl md:text-4xl font-bold text-white">{stat.value}</div>
                <div className="text-sm text-white/80 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-[#1A1A1A] mb-4">
            Ready to get started?
          </h2>
          <p className="text-lg text-[#4A4A4A] mb-8">
            Join the coordinated effort to welcome guests from around the world. 
            Sign in to access your dashboard based on your role.
          </p>
          <Button
            onClick={() => navigate('/login')}
            className="bg-[#2D5A45] hover:bg-[#234839] text-white px-8 py-6 text-lg"
          >
            Sign In
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#1A1A1A] text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center gap-3 mb-4 md:mb-0">
              <div className="w-10 h-10 bg-[#2D5A45] rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">M</span>
              </div>
              <div>
                <span className="text-xl font-semibold">Project Mehmaan</span>
                <p className="text-sm text-gray-400">Guest Management</p>
              </div>
            </div>
            <p className="text-gray-400 text-sm">
              Built for Jalsa Salana UK. Secure guest management system.
            </p>
          </div>
          <div className="mt-8 pt-8 border-t border-gray-700 text-center text-gray-400 text-sm">
            © 2024 Project Mehmaan. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

import React, { useState } from 'react';
import { X, ArrowRight, ArrowLeft, Upload, Globe, Lock, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent } from '@/components/ui/card';

interface CreateCircleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CreateCircleModal: React.FC<CreateCircleModalProps> = ({ isOpen, onClose }) => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    location: '',
    privacy: 'public',
    type: 'free'
  });

  if (!isOpen) return null;

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = () => {
    // Handle circle creation
    console.log('Creating circle:', formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm">
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-md mx-auto bg-background rounded-xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            {step > 1 && (
              <Button variant="ghost" size="icon" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div>
              <h2 className="font-semibold text-foreground">Create Circle</h2>
              <p className="text-sm text-muted-foreground">Step {step} of 3</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Progress Bar */}
        <div className="h-1 bg-muted">
          <div 
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 1 && (
            <div className="space-y-4 animate-fade-in">
              <div>
                <Label htmlFor="name">Circle Name</Label>
                <Input
                  id="name"
                  placeholder="Enter circle name..."
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="What's your circle about?"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  placeholder="e.g., Technology, Health, Business..."
                  value={formData.category}
                  onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                />
              </div>

              <div>
                <Label htmlFor="location">Location (Optional)</Label>
                <Input
                  id="location"
                  placeholder="City, Country or Online"
                  value={formData.location}
                  onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <Label className="text-base font-medium">Privacy Settings</Label>
                <p className="text-sm text-muted-foreground mb-4">Choose who can find and join your circle</p>
                
                <RadioGroup 
                  value={formData.privacy} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, privacy: value }))}
                >
                  <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-center space-x-3">
                        <RadioGroupItem value="public" id="public" />
                        <div className="flex items-center gap-2 flex-1">
                          <Globe className="h-5 w-5 text-green-500" />
                          <div>
                            <Label htmlFor="public" className="font-medium cursor-pointer">Public</Label>
                            <p className="text-sm text-muted-foreground">Anyone can find and join</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-center space-x-3">
                        <RadioGroupItem value="private" id="private" />
                        <div className="flex items-center gap-2 flex-1">
                          <Lock className="h-5 w-5 text-orange-500" />
                          <div>
                            <Label htmlFor="private" className="font-medium cursor-pointer">Private</Label>
                            <p className="text-sm text-muted-foreground">Invite-only membership</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </RadioGroup>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <Label className="text-base font-medium">Circle Type</Label>
                <p className="text-sm text-muted-foreground mb-4">Choose your monetization model</p>
                
                <RadioGroup 
                  value={formData.type} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, type: value }))}
                >
                  <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-center space-x-3">
                        <RadioGroupItem value="free" id="free" />
                        <div>
                          <Label htmlFor="free" className="font-medium cursor-pointer">Free Circle</Label>
                          <p className="text-sm text-muted-foreground">Open to all members</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-center space-x-3">
                        <RadioGroupItem value="premium" id="premium" />
                        <div className="flex items-center gap-2 flex-1">
                          <Crown className="h-5 w-5 text-primary" />
                          <div>
                            <Label htmlFor="premium" className="font-medium cursor-pointer">Premium Circle</Label>
                            <p className="text-sm text-muted-foreground">Monthly subscription required</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </RadioGroup>
              </div>

              {/* Cover Image Upload */}
              <div>
                <Label>Cover Image</Label>
                <div className="mt-2 border-2 border-dashed border-border rounded-lg p-6 text-center hover:bg-accent/50 transition-colors cursor-pointer">
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Upload a cover image</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-border">
          <div className="flex space-x-1">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-2 w-2 rounded-full transition-colors ${
                  i <= step ? 'bg-primary' : 'bg-muted'
                }`}
              />
            ))}
          </div>
          
          <div className="flex gap-2">
            {step < 3 ? (
              <Button onClick={handleNext} disabled={!formData.name}>
                Next
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleSubmit}>
                Create Circle
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateCircleModal;
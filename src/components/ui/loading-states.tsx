import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton, SkeletonText, SkeletonAvatar, SkeletonCard } from '@/components/ui/skeleton';

export const PostCardSkeleton = () => (
  <Card className="mb-3 sm:mb-4 overflow-hidden border-gray-100 bg-white rounded-2xl sm:rounded-3xl">
    <CardContent className="p-4 sm:p-5">
      <div className="flex items-start gap-3 mb-3 sm:mb-4">
        <SkeletonAvatar />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-12" />
          </div>
        </div>
      </div>
      
      <SkeletonText lines={2} className="mb-3 sm:mb-4" />
      <SkeletonCard className="mb-3 sm:mb-4" />
      
      <div className="grid grid-cols-4 gap-1 sm:gap-2 border-t border-gray-50 pt-3 sm:pt-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center justify-center gap-1 py-3">
            <Skeleton className="h-4 w-4 sm:h-5 sm:w-5" />
            <Skeleton className="h-3 w-6" />
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);

export const VideoCardSkeleton = () => (
  <Card className="mb-3 sm:mb-4 overflow-hidden border-gray-100 bg-white rounded-2xl sm:rounded-3xl">
    <CardContent className="p-4 sm:p-5">
      <div className="flex items-start gap-3 mb-3 sm:mb-4">
        <SkeletonAvatar />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-12" />
          </div>
        </div>
      </div>
      
      <div className="relative mb-3 sm:mb-4 rounded-xl overflow-hidden">
        <Skeleton className="w-full h-48 sm:h-64" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Skeleton className="w-12 h-12 sm:w-14 sm:h-14 rounded-full" />
        </div>
      </div>

      <Skeleton className="h-5 w-3/4 mb-1" />
      <SkeletonText lines={2} className="mb-3 sm:mb-4" />

      <div className="grid grid-cols-3 gap-1 sm:gap-2 border-t border-gray-50 pt-3 sm:pt-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center justify-center gap-1 py-3">
            <Skeleton className="h-4 w-4 sm:h-5 sm:w-5" />
            <Skeleton className="h-3 w-6" />
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);

export const ProfileHeaderSkeleton = () => (
  <div className="relative">
    {/* Cover Image Skeleton */}
    <div className="relative h-48 bg-gradient-to-br from-slate-200 to-slate-300 overflow-hidden">
      <div className="absolute inset-0 skeleton" />
      
      {/* Header controls */}
      <div className="relative z-10 flex items-center justify-between p-4">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
    </div>

    {/* Profile Info Section */}
    <div className="relative bg-background">
      {/* Profile Avatar Skeleton */}
      <div className="absolute -top-16 left-6 z-20">
        <Skeleton className="h-32 w-32 rounded-full" />
      </div>

      {/* Profile Details */}
      <div className="pt-20 pb-6 px-6">
        {/* Name and subtitle */}
        <div className="mb-6">
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-4 w-32 mt-1" />
        </div>

        {/* Stats */}
        <div className="flex gap-8 mb-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="h-6 w-12 mb-1" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mb-8">
          <Skeleton className="flex-1 h-10 rounded-lg" />
          <Skeleton className="flex-1 h-10 rounded-lg" />
        </div>
      </div>
    </div>
  </div>
);

export const TabContentSkeleton = ({ itemCount = 3 }: { itemCount?: number }) => (
  <div className="space-y-4 animate-fade-in pb-6">
    <div className="text-center mb-4">
      <Skeleton className="h-8 w-32 mx-auto rounded-full" />
    </div>
    {Array.from({ length: itemCount }).map((_, i) => (
      <PostCardSkeleton key={i} />
    ))}
  </div>
);
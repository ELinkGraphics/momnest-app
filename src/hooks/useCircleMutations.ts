import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface CreateCircleData {
  name: string;
  description: string;
  category: string;
  location?: string;
  is_private: boolean;
  is_premium?: boolean;
  is_expert?: boolean;
  avatar?: File;
  cover?: File;
  about_text?: string | null;
  guidelines?: string[];
}

export const useCircleMutations = () => {
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const queryClient = useQueryClient();

  const createCircle = async (data: CreateCircleData, userId: string) => {
    setIsCreating(true);
    try {
      let avatarUrl = null;
      let coverUrl = null;

      // Upload avatar if provided
      if (data.avatar) {
        const avatarExt = data.avatar.name.split('.').pop();
        const avatarPath = `${userId}/${Date.now()}.${avatarExt}`;
        const { error: avatarError, data: avatarData } = await supabase.storage
          .from('circle-avatars')
          .upload(avatarPath, data.avatar);

        if (avatarError) throw avatarError;
        avatarUrl = supabase.storage.from('circle-avatars').getPublicUrl(avatarPath).data.publicUrl;
      }

      // Upload cover if provided
      if (data.cover) {
        const coverExt = data.cover.name.split('.').pop();
        const coverPath = `${userId}/${Date.now()}.${coverExt}`;
        const { error: coverError } = await supabase.storage
          .from('circle-covers')
          .upload(coverPath, data.cover);

        if (coverError) throw coverError;
        coverUrl = supabase.storage.from('circle-covers').getPublicUrl(coverPath).data.publicUrl;
      }

      // Create circle
      const { data: circle, error: circleError } = await supabase
        .from('circles')
        .insert({
          name: data.name,
          description: data.description,
          category: data.category,
          location: data.location,
          is_private: data.is_private,
          is_premium: data.is_premium || false,
          is_expert: data.is_expert || false,
          avatar_url: avatarUrl,
          cover_image_url: coverUrl,
          creator_id: userId,
        })
        .select()
        .single();

      if (circleError) throw circleError;

      // Auto-join creator as member with 'creator' role
      const { error: memberError } = await supabase
        .from('circle_members')
        .insert({
          circle_id: circle.id,
          user_id: userId,
          role: 'creator',
          status: 'active',
        });

      if (memberError) throw memberError;

      toast.success('Circle created successfully!');
      return circle;
    } catch (error: any) {
      console.error('Error creating circle:', error);
      toast.error(error.message || 'Failed to create circle');
      throw error;
    } finally {
      setIsCreating(false);
    }
  };

  const joinCircle = async (circleId: string, userId: string, isPrivate: boolean) => {
    setIsJoining(true);
    try {
      const { error } = await supabase
        .from('circle_members')
        .insert({
          circle_id: circleId,
          user_id: userId,
          role: 'member',
          status: isPrivate ? 'pending' : 'active',
        });

      if (error) throw error;

      // Invalidate queries to refresh circle data instantly
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['circle', circleId] }),
        queryClient.invalidateQueries({ queryKey: ['circles'] }),
        queryClient.invalidateQueries({ queryKey: ['my-circles'] }),
        queryClient.invalidateQueries({ queryKey: ['circle-posts', circleId] }),
      ]);

      toast.success(isPrivate ? 'Join request sent!' : 'Joined circle successfully!');
    } catch (error: any) {
      console.error('Error joining circle:', error);
      toast.error(error.message || 'Failed to join circle');
      throw error;
    } finally {
      setIsJoining(false);
    }
  };

  const leaveCircle = async (circleId: string, userId: string) => {
    try {
      const { error } = await supabase
        .from('circle_members')
        .delete()
        .eq('circle_id', circleId)
        .eq('user_id', userId);

      if (error) throw error;

      // Invalidate queries to refresh circle data
      queryClient.invalidateQueries({ queryKey: ['circle', circleId] });
      queryClient.invalidateQueries({ queryKey: ['circles'] });

      toast.success('Left circle successfully!');
    } catch (error: any) {
      console.error('Error leaving circle:', error);
      toast.error(error.message || 'Failed to leave circle');
      throw error;
    }
  };

  const deleteCircle = async (circleId: string, userId: string) => {
    try {
      const { error } = await supabase
        .from('circles')
        .delete()
        .eq('id', circleId)
        .eq('creator_id', userId);

      if (error) throw error;

      // Invalidate queries to refresh circle lists instantly
      queryClient.invalidateQueries({ queryKey: ['circles'] });
      queryClient.invalidateQueries({ queryKey: ['my-circles'] });
      queryClient.invalidateQueries({ queryKey: ['owned-circles'] });

      toast.success('Circle deleted successfully!');
    } catch (error: any) {
      console.error('Error deleting circle:', error);
      toast.error(error.message || 'Failed to delete circle');
      throw error;
    }
  };

  const updateCircle = async (circleId: string, userId: string, updates: Partial<CreateCircleData>) => {
    try {
      let avatarUrl = undefined;
      let coverUrl = undefined;

      // Upload new avatar if provided
      if (updates.avatar) {
        const avatarExt = updates.avatar.name.split('.').pop();
        const avatarPath = `${userId}/${Date.now()}.${avatarExt}`;
        const { error: avatarError } = await supabase.storage
          .from('circle-avatars')
          .upload(avatarPath, updates.avatar);

        if (avatarError) throw avatarError;
        avatarUrl = supabase.storage.from('circle-avatars').getPublicUrl(avatarPath).data.publicUrl;
      }

      // Upload new cover if provided
      if (updates.cover) {
        const coverExt = updates.cover.name.split('.').pop();
        const coverPath = `${userId}/${Date.now()}.${coverExt}`;
        const { error: coverError } = await supabase.storage
          .from('circle-covers')
          .upload(coverPath, updates.cover);

        if (coverError) throw coverError;
        coverUrl = supabase.storage.from('circle-covers').getPublicUrl(coverPath).data.publicUrl;
      }

      const updateData: any = {};
      if (updates.name) updateData.name = updates.name;
      if (updates.description) updateData.description = updates.description;
      if (updates.category) updateData.category = updates.category;
      if (updates.location !== undefined) updateData.location = updates.location;
      if (updates.is_private !== undefined) updateData.is_private = updates.is_private;
      if (updates.about_text !== undefined) updateData.about_text = updates.about_text;
      if (updates.guidelines !== undefined) updateData.guidelines = updates.guidelines;
      if (avatarUrl) updateData.avatar_url = avatarUrl;
      if (coverUrl) updateData.cover_image_url = coverUrl;

      const { error } = await supabase
        .from('circles')
        .update(updateData)
        .eq('id', circleId)
        .eq('creator_id', userId);

      if (error) throw error;

      // Invalidate queries to refresh circle data
      queryClient.invalidateQueries({ queryKey: ['circle', circleId] });
      queryClient.invalidateQueries({ queryKey: ['circles'] });

      toast.success('Circle updated successfully!');
    } catch (error: any) {
      console.error('Error updating circle:', error);
      toast.error(error.message || 'Failed to update circle');
      throw error;
    }
  };

  return {
    createCircle,
    joinCircle,
    leaveCircle,
    deleteCircle,
    updateCircle,
    isCreating,
    isJoining,
  };
};

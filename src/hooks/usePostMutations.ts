import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

export interface CreatePostData {
  content: string;
  media?: File[];
  tags?: string[];
  locationText?: string;
  voiceUrl?: string;
  coverImage?: File;
}

export const usePostMutations = () => {
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [isLiking, setIsLiking] = useState(false);

  const createPost = async (data: CreatePostData, userId: string) => {
    setIsCreating(true);
    try {
      let mediaUrls: string[] = [];

      // Upload multiple media files if exist
      if (data.media && data.media.length > 0) {
        const uploadPromises = data.media.map(async (file, index) => {
          const fileExt = file.name.split('.').pop();
          const fileName = `${userId}/post-${Date.now()}-${index}.${fileExt}`;
          
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('post-media')
            .upload(fileName, file);

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from('post-media')
            .getPublicUrl(uploadData.path);
          
          return publicUrl;
        });
        
        mediaUrls = await Promise.all(uploadPromises);
      }

      let coverImageUrl: string | undefined;
      if (data.coverImage) {
        const fileExt = data.coverImage.name.split('.').pop() || 'jpg';
        const fileName = `${userId}/cover-${Date.now()}.${fileExt}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('post-media')
          .upload(fileName, data.coverImage);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('post-media')
          .getPublicUrl(uploadData.path);
        
        coverImageUrl = publicUrl;
      }

      // Insert post with media_urls array
      const insertData: any = {
        user_id: userId,
        content: data.content,
        media_url: mediaUrls[0] || null,
        media_urls: mediaUrls,
        cover_image_url: coverImageUrl || null,
        tags: data.tags || [],
        is_sponsored: false,
      };
      if (data.locationText) insertData.location_text = data.locationText;
      if (data.voiceUrl) insertData.voice_url = data.voiceUrl;

      const { data: post, error: postError } = await supabase
        .from('posts')
        .insert(insertData)
        .select()
        .single();

      if (postError) throw postError;

      toast({
        title: "Post created",
        description: "Your post has been published successfully.",
      });

      return post;
    } catch (error) {
      console.error('Error creating post:', error);
      toast({
        title: "Error",
        description: "Failed to create post. Please try again.",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsCreating(false);
    }
  };

  const toggleLike = async (postId: string, userId: string, isLiked: boolean, reactionType: string = 'like') => {
    setIsLiking(true);
    try {
      // Determine if we are removing the reaction entirely
      const isRemoving = isLiked && (reactionType === 'like' || !reactionType);

      if (isRemoving) {
        // Unlike/Remove reaction
        const { error } = await supabase
          .from('likes')
          .delete()
          .match({ post_id: postId, user_id: userId });

        if (error) throw error;
      } else {
        // Add or update reaction using upsert for robustness (prevents 409 Conflict)
        const { error } = await supabase
          .from('likes')
          .upsert({
            post_id: postId,
            user_id: userId,
            // @ts-ignore
            reaction_type: reactionType
          }, { onConflict: 'post_id,user_id' });

        if (error) throw error;
      }

      // Automatically invalidate relevant queries to ensure system-wide consistency
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['post-detail', postId] });
      queryClient.invalidateQueries({ queryKey: ['circle-posts'] });
      queryClient.invalidateQueries({ queryKey: ['circle-post', postId] });

    } catch (error) {
      console.error('Error toggling like/reaction:', error);
      toast({
        title: "Error",
        description: "Failed to update reaction. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLiking(false);
    }
  };

  const toggleSave = async (postId: string, userId: string, isSaved: boolean) => {
    try {
      if (isSaved) {
        // Unsave
        const { error } = await supabase
          .from('saves')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', userId);

        if (error) throw error;
      } else {
        // Save
        const { error } = await supabase
          .from('saves')
          .insert({
            post_id: postId,
            user_id: userId,
          });

        if (error) throw error;
      }
    } catch (error) {
      console.error('Error toggling save:', error);
      toast({
        title: "Error",
        description: "Failed to update save. Please try again.",
        variant: "destructive",
      });
    }
  };

  const addComment = async (postId: string, userId: string, content: string, parentId?: string) => {
    try {
      const { data, error } = await supabase
        .from('comments')
        .insert({
          post_id: postId,
          user_id: userId,
          content,
          parent_id: parentId || null,
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Comment added",
        description: "Your comment has been posted.",
      });

      return data;
    } catch (error) {
      console.error('Error adding comment:', error);
      toast({
        title: "Error",
        description: "Failed to add comment. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  const incrementShare = async (postId: string) => {
    try {
      // Get current shares count
      const { data: stats } = await supabase
        .from('post_stats')
        .select('shares_count')
        .eq('post_id', postId)
        .single();

      if (stats) {
        const { error } = await supabase
          .from('post_stats')
          .update({ shares_count: stats.shares_count + 1 })
          .eq('post_id', postId);

        if (error) throw error;
      }
    } catch (error) {
      console.error('Error incrementing share:', error);
    }
  };

  const deletePost = async (postId: string, userId: string) => {
    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId)
        .eq('user_id', userId);

      if (error) throw error;

      toast({
        title: "Post deleted",
        description: "Your post has been removed.",
      });
    } catch (error) {
      console.error('Error deleting post:', error);
      toast({
        title: "Error",
        description: "Failed to delete post. Please try again.",
        variant: "destructive",
      });
    }
  };

  return {
    createPost,
    toggleLike,
    toggleSave,
    addComment,
    incrementShare,
    deletePost,
    isCreating,
    isLiking,
  };
};

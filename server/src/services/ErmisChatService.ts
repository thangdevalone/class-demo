import { ErmisChat } from '@ermis-network/ermis-chat-sdk';
import { generateExternalErmisToken } from '../routes/auth';

export class ErmisChatService {
  private apiKey: string;
  private projectId: string;
  private apiUrl: string;

  constructor() {
    this.apiKey = process.env.ERMIS_API_KEY || 'q9cxPBAgawX6OP6nXKHa89NZzoEuyqlf';
    this.projectId = process.env.ERMIS_PROJECT_ID || 'e9bd5039-4e5d-4eb4-8469-9ebdc11898f5';
    this.apiUrl = process.env.ERMIS_BASE_URL || 'https://api-test.ermis.network';
  }

  private async getAdminClient(): Promise<{ client: ErmisChat, user: any }> {
    try {
      // Generate system-admin EXTERNAL token
      const externalToken = await generateExternalErmisToken('system-admin', 'admin');
      if (!externalToken) {
        throw new Error('Failed to generate admin external token');
      }

      const client = ErmisChat.getInstance(this.apiKey, this.projectId, this.apiUrl, {
        allowServerSideConnect: true,
      });

      const user = await client.connectUser(
        {
          api_key: this.apiKey,
          id: 'system-admin',
          name: 'System Admin',
          role: 'admin',
        },
        externalToken,
        true // Maintain server-side persistent connection if applicable
      );

      return { client, user };
    } catch (error: any) {
      console.error('Failed to initialize Ermis Chat Admin client:', error.message);
      throw error;
    }
  }

  /**
   * Creates a new chat channel for a classroom and adds all initial members
   */
  async createClassChannel(
    className: string,
    description: string,
    memberErmisIds: string[]
  ): Promise<string> {
    console.log(`[ErmisChatService] Creating channel for class: ${className}`);
    
    try {
      const { client, user } = await this.getAdminClient();
      
      // Ensure system admin is also in the channel, plus all students/teachers
      const members = [user.me.id, ...memberErmisIds];
      
      // Using 'meeting' as the default channel type
      const channel = client.channel('meeting', {
        name: className,
        description: description || '',
        members: members,
        public: true,
      });

      await channel.create();
      console.log(`[ErmisChatService] Chat channel created successfully: ${channel.cid}`);
      
      // Always disconnect admin client after use if it's transient

      
      return channel.cid;
    } catch (error: any) {
      console.error('[ErmisChatService] Failed to create chat channel:', error?.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Adds a list of members to an existing class channel
   */
  async addMembersToClass(classroomId: string, memberErmisIds: string[]): Promise<void> {
    console.log(`[ErmisChatService] Adding ${memberErmisIds.length} members to channel ${classroomId}`);
    try {
      const { client } = await this.getAdminClient();
      
      const [channelType, ...channelIdParts] = classroomId.split(':');
      const actualChannelId = channelIdParts.join(':');
      const channel = client.channel(channelType, actualChannelId);
      await channel.watch(); // Required to mutate channel
      await channel.addMembers(memberErmisIds);
      
      console.log(`[ErmisChatService] Members added successfully`);

    } catch (error: any) {
      console.error('[ErmisChatService] Failed to add members:', error.message);
      throw error;
    }
  }

  /**
   * Removes a list of members from an existing class channel
   */
  async removeMembersFromClass(classroomId: string, memberErmisIds: string[]): Promise<void> {
    console.log(`[ErmisChatService] Removing ${memberErmisIds.length} members from channel ${classroomId}`);
    try {
      const { client } = await this.getAdminClient();
      
      const [channelType, ...channelIdParts] = classroomId.split(':');
      const actualChannelId = channelIdParts.join(':');
      const channel = client.channel(channelType, actualChannelId);
      await channel.watch();
      await channel.removeMembers(memberErmisIds);
      
      console.log(`[ErmisChatService] Members removed successfully`);

    } catch (error: any) {
      console.error('[ErmisChatService] Failed to remove members:', error.message);
      throw error;
    }
  }

  /**
   * Updates channel metadata
   */
  async updateClassChannel(classroomId: string, name?: string, description?: string): Promise<void> {
    try {
      const { client } = await this.getAdminClient();
      
      const [channelType, ...channelIdParts] = classroomId.split(':');
      const actualChannelId = channelIdParts.join(':');
      const channel = client.channel(channelType, actualChannelId);
      await channel.watch();
      
      const updateData: any = {};
      if (name) updateData.name = name;
      if (description !== undefined) updateData.description = description;

      if (Object.keys(updateData).length > 0) {
        await channel.update(updateData);
      }
      

    } catch (error: any) {
      console.error('[ErmisChatService] Failed to update channel:', error.message);
      throw error;
    }
  }

  /**
   * Deletes a channel
   */
  async deleteClassChannel(classroomId: string): Promise<void> {
    try {
      const { client } = await this.getAdminClient();
      const [channelType, ...channelIdParts] = classroomId.split(':');
      const actualChannelId = channelIdParts.join(':');
      const channel = client.channel(channelType, actualChannelId);
      await channel.delete();

    } catch (error: any) {
      console.error('[ErmisChatService] Failed to delete channel:', error.message);
      throw error;
    }
  }
}

export const ermisChatService = new ErmisChatService();

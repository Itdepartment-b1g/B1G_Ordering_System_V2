import { supabase } from '@/lib/supabase';

export interface SubTeam {
    id: string;
    name: string;
    manager_id: string;
    leader_id: string;
    company_id: string;
    created_at: string;
    updated_at: string;
    // Joined fields
    leader_name?: string;
    member_count?: number;
}

export const fetchSubTeams = async (companyId: string): Promise<SubTeam[]> => {
    const { data, error } = await supabase
        .from('sub_teams')
        .select(`
            *,
            profiles!sub_teams_leader_id_fkey(full_name)
        `)
        .eq('company_id', companyId);

    if (error) throw error;

    // Fetch member counts for each sub-team
    const subTeams = data.map((team: any) => ({
        ...team,
        leader_name: team.profiles?.full_name || 'Unknown'
    }));

    return subTeams;
};

export const createSubTeam = async (name: string, managerId: string, leaderId: string, companyId: string) => {
    const { data, error } = await supabase
        .from('sub_teams')
        .insert({
            name,
            manager_id: managerId,
            leader_id: leaderId,
            company_id: companyId
        })
        .select()
        .single();

    if (error) throw error;
    return data;
};

export const deleteSubTeam = async (id: string) => {
    const { error } = await supabase
        .from('sub_teams')
        .delete()
        .eq('id', id);

    if (error) throw error;
};

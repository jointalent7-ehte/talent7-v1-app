alter table public.expert_help_requests
drop constraint if exists expert_help_requests_help_type_check;

alter table public.expert_help_requests
add constraint expert_help_requests_help_type_check
check (
  help_type in (
    'Medical guidance',
    'Fitness injury',
    'Plumbing',
    'Electrical',
    'Tech help',
    'Auto / bike help',
    'Home repair',
    'Study help',
    'Career help',
    'Mental wellness support',
    'Legal / document guidance',
    'Travel/local guidance',
    'Cooking / nutrition help',
    'Parenting / childcare guidance',
    'Pet care guidance',
    'Other urgent help'
  )
);

alter table public.expert_profiles
drop constraint if exists expert_profiles_expertise_area_check;

alter table public.expert_profiles
add constraint expert_profiles_expertise_area_check
check (
  expertise_area in (
    'Medical guidance',
    'Fitness injury',
    'Plumbing',
    'Electrical',
    'Tech help',
    'Auto / bike help',
    'Home repair',
    'Study help',
    'Career help',
    'Mental wellness support',
    'Legal / document guidance',
    'Travel/local guidance',
    'Cooking / nutrition help',
    'Parenting / childcare guidance',
    'Pet care guidance',
    'Other urgent help'
  )
);
